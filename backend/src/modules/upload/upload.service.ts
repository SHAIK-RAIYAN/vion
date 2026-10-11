import { db } from "../../prisma/db";
import { AppError } from "../../utils/AppError";
import { getPaginationMeta, type Pagination } from "../../utils/pagination";
import {
  createUploadSchema,
  updateUploadSchema,
  addVideoResolutionSchema,
  type CreateUploadInput,
  type UpdateUploadInput,
  type AddVideoResolutionInput,
} from "./upload.schema";

const { Upload, Channel, Video } = db.orm.public;

export async function createUpload(input: CreateUploadInput, userId: string) {
  const data = createUploadSchema.parse(input);

  const channel = await Channel.where({ userId }).first();
  if (!channel) {
    throw new AppError("You must create a channel before uploading videos.", 400);
  }

  const upload = await Upload.create({
    channelId: channel.id,
    title: data.title,
    description: data.description || null,
    thumbnailUrl: data.thumbnailUrl || null,
    hlsManifestUrl: data.hlsManifestUrl || null,
    visibility: data.visibility || "PRIVATE",
    processingStatus: "PENDING",
  });

  return upload;
}

import * as storageService from "../../services/storageService";
import { isStorageConfigured, STORAGE_RAW_BUCKET } from "../../config/config";
import { enqueueTranscodeJob } from "../../queue/videoQueue";

export async function createPresignedUrl(
  input: { fileName: string; contentType: string; fileSize?: number },
  userId: string,
) {
  const channel = await Channel.where({ userId }).first();
  if (!channel) {
    throw new AppError("You must create a channel before uploading videos.", 400);
  }

  // Server-generated storage layout path
  const uploadId = crypto.randomUUID();
  const key = storageService.generateRawVideoKey(channel.id, uploadId, input.fileName);

  let uploadUrl = "";
  let uploadToken = "";

  if (isStorageConfigured()) {
    try {
      const signed = await storageService.createSignedUploadUrl(STORAGE_RAW_BUCKET, key);
      uploadUrl = signed.signedUrl;
      uploadToken = signed.token;
    } catch (err: any) {
      console.warn("Supabase Storage signed URL warning:", err.message);
      uploadUrl = `https://storage.vion.local/${STORAGE_RAW_BUCKET}/${key}`;
    }
  } else {
    uploadUrl = `https://storage.vion.local/${STORAGE_RAW_BUCKET}/${key}`;
  }

  const upload = await Upload.create({
    id: uploadId,
    channelId: channel.id,
    title: input.fileName.replace(/\.[^/.]+$/, "") || "Untitled Upload",
    visibility: "PRIVATE",
    processingStatus: "UPLOADING",
  });

  return {
    uploadId: upload.id,
    uploadUrl,
    key,
    bucket: STORAGE_RAW_BUCKET,
    token: uploadToken,
    method: "PUT",
    headers: {
      "Content-Type": input.contentType,
    },
    expiresInSeconds: 3600,
  };
}


export async function createRemoteUrlUpload(
  input: { url: string; title: string; description?: string },
  userId: string,
) {
  const channel = await Channel.where({ userId }).first();
  if (!channel) {
    throw new AppError("You must create a channel before uploading videos.", 400);
  }

  const upload = await Upload.create({
    channelId: channel.id,
    title: input.title,
    description: input.description || null,
    visibility: "PRIVATE",
    processingStatus: "PENDING",
  });

  return {
    ...upload,
    sourceRemoteUrl: input.url,
  };
}

export async function getUploadStatus(uploadId: string, userId: string) {
  const upload = await Upload.where({ id: uploadId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();

  if (!upload) {
    throw new AppError("Upload not found.", 404);
  }

  if (upload.channel.userId !== userId) {
    throw new AppError("Unauthorized access to upload status.", 403);
  }

  let progressPercentage = 0;
  if (upload.processingStatus === "PENDING") progressPercentage = 10;
  else if (upload.processingStatus === "UPLOADING") progressPercentage = 30;
  else if (upload.processingStatus === "TRANSCODING") progressPercentage = 60;
  else if (upload.processingStatus === "COMPLETED") progressPercentage = 100;
  else if (upload.processingStatus === "FAILED") progressPercentage = 0;

  return {
    uploadId: upload.id,
    status: upload.processingStatus,
    progressPercentage,
    hlsManifestUrl: upload.hlsManifestUrl,
    thumbnailUrl: upload.thumbnailUrl,
    updatedAt: upload.updatedAt,
  };
}

export async function finalizeUpload(uploadId: string, userId: string, storageKey?: string) {
  const upload = await Upload.where({ id: uploadId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();

  if (!upload) {
    throw new AppError("Upload not found.", 404);
  }

  if (upload.channel.userId !== userId) {
    throw new AppError("Unauthorized access to finalize this upload.", 403);
  }

  // Confirm raw upload completed and transition to TRANSCODING
  const updated = await Upload.where({ id: uploadId }).update({
    processingStatus: "TRANSCODING",
  });

  if (!updated) {
    throw new AppError("Failed to finalize upload.", 500);
  }

  // Derive storage key if not explicitly passed
  const effectiveKey = storageKey || `raw/${upload.channel.id}/${uploadId}/video.mp4`;

  // Enqueue background transcoding job into BullMQ
  const job = await enqueueTranscodeJob({
    uploadId: updated.id,
    channelId: upload.channel.id,
    rawVideoKey: effectiveKey,
    title: upload.title,
  });

  return {
    uploadId: updated.id,
    status: updated.processingStatus,
    jobId: job ? job.id : null,
    message: "Raw upload finalized. Video queued for background transcoding.",
  };
}



export async function getUploadById(id: string, currentUserId?: string) {
  const upload = await Upload.where({ id, isDeleted: false })
    .include("channel", (c) =>
      c.select("id", "userId", "handle", "channelName", "profilePictureUrl"),
    )
    .include("videos", (v) => v.select("id", "resolution", "url"))
    .include("comments", (c) => c.count())
    .include("interactions", (i) => i.count())
    .first();

  if (!upload) {
    throw new AppError("Video not found.", 404);
  }

  if (upload.visibility === "PRIVATE") {
    if (!currentUserId || upload.channel.userId !== currentUserId) {
      throw new AppError("This video is private.", 403);
    }
  }

  // Increment view count
  const updatedViewCount = upload.viewCount + 1;
  await Upload.where({ id }).update({ viewCount: updatedViewCount });

  return {
    ...upload,
    viewCount: updatedViewCount,
  };
}

export async function getPublicUploads(pagination: Pagination) {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const [items, countResult] = await Promise.all([
    Upload.where({ isDeleted: false, visibility: "PUBLIC" })
      .include("channel", (c) =>
        c.select("id", "handle", "channelName", "profilePictureUrl"),
      )
      .orderBy((u) => u.createdAt.desc())
      .limit(limit)
      .offset(offset)
      .all(),
    Upload.where({ isDeleted: false, visibility: "PUBLIC" }).aggregate((agg) => ({
      count: agg.count(),
    })),
  ]);

  return {
    items,
    pagination: getPaginationMeta(countResult.count, page, limit),
  };
}

export async function getChannelUploads(
  channelId: string,
  pagination: Pagination,
  currentUserId?: string,
) {
  const channel = await Channel.first({ id: channelId });
  if (!channel) {
    throw new AppError("Channel not found.", 404);
  }

  const isOwner = currentUserId && channel.userId === currentUserId;
  const whereCondition = isOwner
    ? { channelId, isDeleted: false }
    : { channelId, isDeleted: false, visibility: "PUBLIC" as const };

  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const [items, countResult] = await Promise.all([
    Upload.where(whereCondition)
      .include("channel", (c) =>
        c.select("id", "handle", "channelName", "profilePictureUrl"),
      )
      .orderBy((u) => u.createdAt.desc())
      .limit(limit)
      .offset(offset)
      .all(),
    Upload.where(whereCondition).aggregate((agg) => ({
      count: agg.count(),
    })),
  ]);

  return {
    items,
    pagination: getPaginationMeta(countResult.count, page, limit),
  };
}

export async function getMyUploads(userId: string, pagination: Pagination) {
  const { page, limit } = pagination;
  const channel = await Channel.where({ userId }).first();
  if (!channel) {
    return {
      items: [],
      pagination: getPaginationMeta(0, page, limit),
    };
  }

  const offset = (page - 1) * limit;
  const whereCondition = { channelId: channel.id, isDeleted: false };

  const [items, countResult] = await Promise.all([
    Upload.where(whereCondition)
      .include("videos", (v) => v.select("id", "resolution", "url"))
      .orderBy((u) => u.createdAt.desc())
      .limit(limit)
      .offset(offset)
      .all(),
    Upload.where(whereCondition).aggregate((agg) => ({
      count: agg.count(),
    })),
  ]);

  return {
    items,
    pagination: getPaginationMeta(countResult.count, page, limit),
  };
}

export async function updateUpload(
  id: string,
  input: UpdateUploadInput,
  userId: string,
) {
  const data = updateUploadSchema.parse(input);

  const upload = await Upload.where({ id, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();

  if (!upload) {
    throw new AppError("Video not found.", 404);
  }

  if (upload.channel.userId !== userId) {
    throw new AppError("You do not have permission to update this video.", 403);
  }

  const updated = await Upload.where({ id }).update({
    ...(data.title ? { title: data.title } : {}),
    ...(data.description !== undefined ? { description: data.description || null } : {}),
    ...(data.thumbnailUrl !== undefined ? { thumbnailUrl: data.thumbnailUrl || null } : {}),
    ...(data.hlsManifestUrl !== undefined ? { hlsManifestUrl: data.hlsManifestUrl || null } : {}),
    ...(data.visibility ? { visibility: data.visibility } : {}),
    ...(data.processingStatus ? { processingStatus: data.processingStatus } : {}),
  });

  return updated;
}

export async function deleteUpload(id: string, userId: string) {
  const upload = await Upload.where({ id, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();

  if (!upload) {
    throw new AppError("Video not found.", 404);
  }

  if (upload.channel.userId !== userId) {
    throw new AppError("You do not have permission to delete this video.", 403);
  }

  await Upload.where({ id }).update({ isDeleted: true });

  return { message: "Video deleted successfully" };
}

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
