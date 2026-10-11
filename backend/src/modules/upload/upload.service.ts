import crypto from "crypto";
import { db } from "../../prisma/db";
import { AppError } from "../../utils/AppError";
import { getPaginationMeta, type Pagination } from "../../utils/pagination";
import {
  createUploadSchema,
  updateUploadSchema,
  presignedUrlSchema,
  remoteUrlSchema,
  addVideoResolutionSchema,
  type CreateUploadInput,
  type UpdateUploadInput,
  type PresignedUrlInput,
  type RemoteUrlInput,
  type AddVideoResolutionInput,
} from "./upload.schema";
import * as storageService from "../../services/storageService";
import {
  isStorageConfigured,
  STORAGE_RAW_BUCKET,
  MAX_UPLOAD_SIZE_BYTES,
} from "../../config/config";
import {
  enqueueTranscodeJob,
  getTranscodeJobByUploadId,
} from "../../queue/videoQueue";
import { validateRemoteVideoUrl } from "../../utils/ssrfValidator";

const { Upload, Channel, Video } = db.orm.public;

/**
 * 1. POST /api/v1/uploads
 * Creates an upload session record and issues temporary direct storage credentials.
 */
export async function createUpload(input: CreateUploadInput, userId: string) {
  const data = createUploadSchema.parse(input);

  const channel = await Channel.where({ userId }).first();
  if (!channel) {
    throw new AppError("You must create a channel before uploading videos.", 400, "NO_CHANNEL");
  }

  const uploadId = crypto.randomUUID();
  const safeFileName = data.fileName || "source_video.mp4";
  const contentType = data.contentType || "video/mp4";

  // Server-controlled destination path
  const storageKey = storageService.generateRawVideoKey(channel.id, uploadId, safeFileName);

  if (!isStorageConfigured()) {
    throw new AppError(
      "Storage service is not configured. Please verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.",
      500,
      "STORAGE_NOT_CONFIGURED",
    );
  }

  // Generate signed upload URL from Supabase BEFORE creating the database record.
  // If signed URL generation fails, propagate the error without leaving an orphaned Upload record.
  const signed = await storageService.createSignedUploadUrl(STORAGE_RAW_BUCKET, storageKey, {
    expiresInSeconds: 3600,
  });

  // Create Upload record with initial UPLOADING status only after URL is successfully generated
  const upload = await Upload.create({
    id: uploadId,
    channelId: channel.id,
    title: data.title,
    description: data.description || null,
    thumbnailUrl: data.thumbnailUrl || null,
    visibility: data.visibility || "PRIVATE",
    processingStatus: "UPLOADING",
  });

  return {
    uploadId: upload.id,
    title: upload.title,
    visibility: upload.visibility,
    processingStatus: upload.processingStatus,
    uploadSession: {
      uploadUrl: signed.signedUrl,
      key: storageKey,
      bucket: STORAGE_RAW_BUCKET,
      token: signed.token,
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      expiresInSeconds: 3600,
      maxSizeBytes: MAX_UPLOAD_SIZE_BYTES,
    },
  };
}

/**
 * 2. POST /api/v1/uploads/presigned-url
 * Generates or renews a secure direct upload capability for an upload.
 */
export async function createPresignedUrl(input: PresignedUrlInput, userId: string) {
  const data = presignedUrlSchema.parse(input);

  const channel = await Channel.where({ userId }).first();
  if (!channel) {
    throw new AppError("You must create a channel before uploading videos.", 400, "NO_CHANNEL");
  }

  if (!isStorageConfigured()) {
    throw new AppError(
      "Storage service is not configured. Please verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      500,
      "STORAGE_NOT_CONFIGURED",
    );
  }

  let uploadId = data.uploadId;
  let isNewUpload = false;

  if (uploadId) {
    // Renew / obtain upload permission for existing record
    const existing = await Upload.where({ id: uploadId, isDeleted: false })
      .include("channel", (c) => c.select("id", "userId"))
      .first();

    if (!existing) {
      throw new AppError("Upload record not found.", 404, "UPLOAD_NOT_FOUND");
    }

    if (existing.channel.userId !== userId) {
      throw new AppError("You do not own this upload session.", 403, "FORBIDDEN");
    }

    if (existing.processingStatus === "COMPLETED") {
      throw new AppError(
        "Cannot request upload URL for a video that has already finished processing.",
        409,
        "ALREADY_COMPLETED",
      );
    }
  } else {
    uploadId = crypto.randomUUID();
    isNewUpload = true;
  }

  const key = storageService.generateRawVideoKey(channel.id, uploadId, data.fileName);

  // Generate signed upload URL from Supabase BEFORE creating new DB record
  const signed = await storageService.createSignedUploadUrl(STORAGE_RAW_BUCKET, key, {
    expiresInSeconds: 3600,
  });

  // If this is a new upload session, create the DB record only after URL generation succeeds
  if (isNewUpload) {
    await Upload.create({
      id: uploadId,
      channelId: channel.id,
      title: data.fileName.replace(/\.[^/.]+$/, "") || "Untitled Upload",
      visibility: "PRIVATE",
      processingStatus: "UPLOADING",
    });
  }

  return {
    uploadId,
    uploadUrl: signed.signedUrl,
    key,
    bucket: STORAGE_RAW_BUCKET,
    token: signed.token,
    method: "PUT",
    headers: {
      "Content-Type": data.contentType,
    },
    expiresInSeconds: 3600,
    maxSizeBytes: MAX_UPLOAD_SIZE_BYTES,
  };
}

/**
 * 3. POST /api/v1/uploads/remote-url
 * Registers an approved remote video source for server ingest with SSRF protections.
 */
export async function createRemoteUrlUpload(input: RemoteUrlInput, userId: string) {
  const data = remoteUrlSchema.parse(input);

  // Validate URL and enforce SSRF protections against private addresses and forbidden sources
  const validated = await validateRemoteVideoUrl(data.url);

  const channel = await Channel.where({ userId }).first();
  if (!channel) {
    throw new AppError("You must create a channel before uploading videos.", 400, "NO_CHANNEL");
  }

  const uploadId = crypto.randomUUID();
  const upload = await Upload.create({
    id: uploadId,
    channelId: channel.id,
    title: data.title,
    description: data.description || null,
    visibility: data.visibility || "PRIVATE",
    processingStatus: "PENDING",
  });

  return {
    uploadId: upload.id,
    title: upload.title,
    sourceRemoteUrl: validated.url,
    hostname: validated.hostname,
    contentType: validated.contentType,
    status: upload.processingStatus,
    message: "Remote video source registered for ingest.",
  };
}

/**
 * 4. GET /api/v1/uploads/:uploadId
 * Retrieves complete upload information with ownership checks for private videos.
 */
export async function getUploadById(uploadId: string, currentUserId?: string) {
  const upload = await Upload.where({ id: uploadId, isDeleted: false })
    .include("channel", (c) =>
      c.select("id", "userId", "handle", "channelName", "profilePictureUrl"),
    )
    .include("videos", (v) => v.select("id", "resolution", "url"))
    .first();

  if (!upload) {
    throw new AppError("Upload not found.", 404, "UPLOAD_NOT_FOUND");
  }

  // Non-completed uploads or private videos are restricted to the channel owner
  const isOwner = currentUserId && upload.channel.userId === currentUserId;
  if (!isOwner && (upload.visibility === "PRIVATE" || upload.processingStatus !== "COMPLETED")) {
    throw new AppError("This video upload is private or currently processing.", 403, "FORBIDDEN");
  }

  return upload;
}

/**
 * 5. GET /api/v1/uploads/:uploadId/status
 * Retrieves processing status and percentage for the authenticated owner.
 */
export async function getUploadStatus(uploadId: string, userId: string) {
  const upload = await Upload.where({ id: uploadId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();

  if (!upload) {
    throw new AppError("Upload not found.", 404, "UPLOAD_NOT_FOUND");
  }

  if (upload.channel.userId !== userId) {
    throw new AppError("Unauthorized access to upload status.", 403, "FORBIDDEN");
  }

  // Distinguish live BullMQ queue progress from persistent database status
  let liveQueueInfo: {
    jobId: string | null;
    state: string | null;
    progress: number | null;
  } | null = null;

  try {
    const job = await getTranscodeJobByUploadId(uploadId);
    if (job) {
      const state = await job.getState();
      const rawProgress = job.progress;
      liveQueueInfo = {
        jobId: job.id || null,
        state,
        progress: typeof rawProgress === "number" ? rawProgress : null,
      };
    }
  } catch {
    // Graceful degradation when Redis is offline or job query fails
  }

  return {
    uploadId: upload.id,
    status: upload.processingStatus, // Persistent database status
    databaseStatus: upload.processingStatus,
    queue: liveQueueInfo, // Live queue progress & state (null if not currently in queue)
    hlsManifestUrl: upload.hlsManifestUrl,
    thumbnailUrl: upload.thumbnailUrl,
    updatedAt: upload.updatedAt,
  };
}

/**
 * 6. PATCH /api/v1/uploads/:uploadId
 * Updates upload metadata before publication.
 */
export async function updateUpload(
  uploadId: string,
  input: UpdateUploadInput,
  userId: string,
) {
  const data = updateUploadSchema.parse(input);

  const upload = await Upload.where({ id: uploadId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();

  if (!upload) {
    throw new AppError("Upload not found.", 404, "UPLOAD_NOT_FOUND");
  }

  if (upload.channel.userId !== userId) {
    throw new AppError("You do not have permission to update this upload.", 403, "FORBIDDEN");
  }

  const updated = await Upload.where({ id: uploadId }).update({
    ...(data.title ? { title: data.title } : {}),
    ...(data.description !== undefined ? { description: data.description || null } : {}),
    ...(data.thumbnailUrl !== undefined ? { thumbnailUrl: data.thumbnailUrl || null } : {}),
    ...(data.visibility ? { visibility: data.visibility } : {}),
  });

  return updated;
}

/**
 * 7. POST /api/v1/uploads/:uploadId/finalize
 * Verifies the stored file and its ownership, then enqueues background processing.
 * Idempotent: Repeated calls do not enqueue duplicate work.
 */
export async function finalizeUpload(uploadId: string, userId: string, storageKey?: string) {
  const upload = await Upload.where({ id: uploadId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();

  if (!upload) {
    throw new AppError("Upload not found.", 404, "UPLOAD_NOT_FOUND");
  }

  if (upload.channel.userId !== userId) {
    throw new AppError("Unauthorized access to finalize this upload.", 403, "FORBIDDEN");
  }

  // Idempotency check: Do not re-enqueue duplicate jobs if already processing or finished
  if (upload.processingStatus === "COMPLETED") {
    return {
      uploadId: upload.id,
      status: upload.processingStatus,
      message: "Upload has already completed processing.",
      alreadyCompleted: true,
    };
  }

  if (upload.processingStatus === "TRANSCODING") {
    return {
      uploadId: upload.id,
      status: upload.processingStatus,
      message: "Upload is already in transcoding processing.",
      alreadyProcessing: true,
    };
  }

  // Check BullMQ for active or waiting job to ensure idempotency across rapid duplicate calls
  try {
    const existingJob = await getTranscodeJobByUploadId(uploadId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === "waiting" || state === "active" || state === "delayed") {
        return {
          uploadId: upload.id,
          status: upload.processingStatus,
          jobId: existingJob.id,
          message:
            state === "active"
              ? "Upload is actively being transcoded."
              : "Upload is already queued for transcoding.",
          alreadyProcessing: true,
        };
      }
    }
  } catch {
    // Non-fatal if queue check fails
  }

  // If retrying a previously failed upload, reset processingStatus to UPLOADING
  if (upload.processingStatus === "FAILED") {
    await Upload.where({ id: uploadId }).update({ processingStatus: "UPLOADING" });
    upload.processingStatus = "UPLOADING";
  }

  // Enforce server-controlled storage path prefix
  const expectedFolder = `raw/${upload.channel.id}/${uploadId}`;
  if (storageKey && !storageKey.startsWith(expectedFolder)) {
    throw new AppError(
      "Supplied storage key does not match this upload session.",
      403,
      "INVALID_STORAGE_KEY",
    );
  }

  let verifiedStorageKey = storageKey || `${expectedFolder}/source_video.mp4`;

  // Verify object existence and size in Supabase Storage
  if (!isStorageConfigured()) {
    throw new AppError(
      "Storage service is not configured. Please verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      500,
      "STORAGE_NOT_CONFIGURED",
    );
  }

  const files = await storageService.listFiles(STORAGE_RAW_BUCKET, expectedFolder);

  if (!files || files.length === 0) {
    throw new AppError(
      "No uploaded video found in storage for this session. Please complete the file upload before finalizing.",
      400,
      "MEDIA_NOT_FOUND",
    );
  }

  // Identify the uploaded file
  const mediaFile = files[0];
  if (!mediaFile) {
    throw new AppError("No file found in upload session folder.", 400, "MEDIA_NOT_FOUND");
  }
  verifiedStorageKey = `${expectedFolder}/${mediaFile.name}`;

  const rawSizeBytes = (mediaFile as any).metadata?.size || 0;
  if (rawSizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    // Enforce maximum size: clean up oversized object and mark failed
    await storageService.deleteFiles(STORAGE_RAW_BUCKET, [verifiedStorageKey]);
    await Upload.where({ id: uploadId }).update({ processingStatus: "FAILED" });
    throw new AppError(
      `Uploaded video (${Math.round(rawSizeBytes / (1024 * 1024))} MB) exceeds maximum allowed limit.`,
      413,
      "FILE_TOO_LARGE",
    );
  }

  // Note: Status remains UPLOADING while waiting in BullMQ queue.
  // The worker process will transition state to TRANSCODING when it actively begins processing.

  // Enqueue background transcoding job into BullMQ
  const job = await enqueueTranscodeJob({
    uploadId: upload.id,
    channelId: upload.channel.id,
    rawVideoKey: verifiedStorageKey,
    title: upload.title,
  });

  return {
    uploadId: upload.id,
    status: upload.processingStatus,
    jobId: job ? job.id : null,
    message: "Raw upload verified successfully and queued for transcoding.",
  };
}

/**
 * 8. DELETE /api/v1/uploads/:uploadId
 * Cancels or soft-deletes an upload session and cleans up raw storage objects.
 */
export async function deleteUpload(uploadId: string, userId: string) {
  const upload = await Upload.where({ id: uploadId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();

  if (!upload) {
    throw new AppError("Upload not found.", 404, "UPLOAD_NOT_FOUND");
  }

  if (upload.channel.userId !== userId) {
    throw new AppError("You do not have permission to delete this upload.", 403, "FORBIDDEN");
  }

  // 1. Soft-delete in database
  await Upload.where({ id: uploadId }).update({ isDeleted: true });

  // 2. Safe cleanup of raw objects in storage
  if (isStorageConfigured()) {
    try {
      const folder = `raw/${upload.channel.id}/${uploadId}`;
      const files = await storageService.listFiles(STORAGE_RAW_BUCKET, folder);
      if (files && files.length > 0) {
        const filePaths = files.map((f) => `${folder}/${f.name}`);
        await storageService.deleteFiles(STORAGE_RAW_BUCKET, filePaths);
      }
    } catch (err: any) {
      console.warn("[Upload Service] Cleanup storage files warning:", err.message);
    }
  }

  return { message: "Upload session deleted successfully." };
}

/**
 * Helper for adding resolutions (used during video publication/transcoding)
 */
export async function addVideoResolution(
  uploadId: string,
  input: AddVideoResolutionInput,
  userId: string,
) {
  const data = addVideoResolutionSchema.parse(input);

  const upload = await Upload.where({ id: uploadId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();

  if (!upload) {
    throw new AppError("Video not found.", 404);
  }

  if (upload.channel.userId !== userId) {
    throw new AppError("You do not have permission to modify this video.", 403);
  }

  const video = await Video.create({
    uploadId,
    resolution: data.resolution,
    url: data.url,
  });

  return video;
}
