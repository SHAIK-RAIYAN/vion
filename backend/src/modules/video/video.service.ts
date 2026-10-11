import { db } from "../../prisma/db";
import { AppError } from "../../utils/AppError";
import {
  publishVideoSchema,
  updateVideoSchema,
  type PublishVideoInput,
  type UpdateVideoInput,
} from "./video.schema";
import * as interactionService from "../interaction/interaction.service";

const { Upload, Channel, Video } = db.orm.public;

// In-memory sliding view cooldown cache: `${clientIdentifier}:${videoId}` -> timestamp
const viewCooldownMap = new Map<string, number>();

export function shouldIncrementView(clientIdentifier: string, videoId: string): boolean {
  const key = `${clientIdentifier}:${videoId}`;
  const now = Date.now();
  const lastTime = viewCooldownMap.get(key);
  // Cooldown window: 60 seconds (prevents rapid polling/refresh inflation)
  if (lastTime && now - lastTime < 60000) {
    return false;
  }
  viewCooldownMap.set(key, now);
  // Prune cache periodically
  if (viewCooldownMap.size > 10000) {
    const cutoff = now - 60000;
    for (const [k, time] of viewCooldownMap.entries()) {
      if (time < cutoff) viewCooldownMap.delete(k);
    }
  }
  return true;
}

export interface GetVideoOptions {
  clientIdentifier?: string;
  recordView?: boolean;
}

export async function publishVideo(input: PublishVideoInput, userId: string) {
  const data = publishVideoSchema.parse(input);

  const channel = await Channel.where({ userId }).first();
  if (!channel) {
    throw new AppError("Channel not found for this user.", 404, "CHANNEL_NOT_FOUND");
  }

  const upload = await Upload.where({ id: data.uploadId, isDeleted: false }).first();
  if (!upload) {
    throw new AppError("Upload record not found.", 404, "UPLOAD_NOT_FOUND");
  }

  if (upload.channelId !== channel.id) {
    throw new AppError("You do not own this upload.", 403, "FORBIDDEN");
  }

  // Publication gate: an upload can only be published if HLS assets are ready
  if (upload.processingStatus !== "COMPLETED") {
    throw new AppError(
      `Cannot publish upload with status '${upload.processingStatus}'. Video transcoding must be COMPLETED before publication.`,
      409,
      "PROCESSING_NOT_COMPLETED",
    );
  }

  if (!upload.hlsManifestUrl) {
    throw new AppError(
      "Cannot publish upload: HLS master manifest has not been generated.",
      409,
      "MANIFEST_MISSING",
    );
  }

  const published = await Upload.where({ id: data.uploadId }).update({
    ...(data.title ? { title: data.title } : {}),
    ...(data.description !== undefined ? { description: data.description || null } : {}),
    ...(data.thumbnailUrl !== undefined ? { thumbnailUrl: data.thumbnailUrl || null } : {}),
    visibility: data.visibility || upload.visibility || "PUBLIC",
    processingStatus: "COMPLETED",
  });

  return published;
}

export async function getVideoById(
  videoId: string,
  currentUserId?: string,
  options: GetVideoOptions = {},
) {
  const video = await Upload.where({ id: videoId, isDeleted: false })
    .include("channel", (c) =>
      c.select("id", "userId", "handle", "channelName", "profilePictureUrl"),
    )
    .include("videos", (v) => v.select("id", "resolution", "url"))
    .include("comments", (c) => c.count())
    .include("interactions", (i) => i.count())
    .first();

  if (!video) {
    throw new AppError("Video not found.", 404, "VIDEO_NOT_FOUND");
  }

  // Authorization gate for private videos: only the channel owner can access
  if (video.visibility === "PRIVATE") {
    if (!currentUserId || video.channel.userId !== currentUserId) {
      throw new AppError("This video is private.", 403, "PRIVATE_VIDEO");
    }
  }

  // Deliberate view increment strategy: debounced by 60s cooldown per client
  let updatedViewCount = video.viewCount;
  if (options.recordView && options.clientIdentifier) {
    if (shouldIncrementView(options.clientIdentifier, videoId)) {
      updatedViewCount = video.viewCount + 1;
      try {
        await Upload.where({ id: videoId }).update({ viewCount: updatedViewCount });
      } catch (err: any) {
        console.warn(`[Video Service] View count update notice for ${videoId}: ${err.message}`);
      }
    }
  }

  const isReady = video.processingStatus === "COMPLETED" && Boolean(video.hlsManifestUrl);

  return {
    ...video,
    viewCount: updatedViewCount,
    isReady,
  };
}

export async function updateVideo(
  videoId: string,
  input: UpdateVideoInput,
  userId: string,
) {
  const data = updateVideoSchema.parse(input);

  const video = await Upload.where({ id: videoId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();

  if (!video) {
    throw new AppError("Video not found.", 404, "VIDEO_NOT_FOUND");
  }

  if (video.channel.userId !== userId) {
    throw new AppError("You do not have permission to update this video.", 403, "FORBIDDEN");
  }

  const updated = await Upload.where({ id: videoId }).update({
    ...(data.title ? { title: data.title } : {}),
    ...(data.description !== undefined ? { description: data.description || null } : {}),
    ...(data.thumbnailUrl !== undefined ? { thumbnailUrl: data.thumbnailUrl || null } : {}),
    ...(data.visibility ? { visibility: data.visibility } : {}),
  });

  return updated;
}

export async function deleteVideo(videoId: string, userId: string) {
  const video = await Upload.where({ id: videoId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();

  if (!video) {
    throw new AppError("Video not found.", 404, "VIDEO_NOT_FOUND");
  }

  if (video.channel.userId !== userId) {
    throw new AppError("You do not have permission to delete this video.", 403, "FORBIDDEN");
  }

  await Upload.where({ id: videoId }).update({ isDeleted: true });

  return { message: "Video deleted successfully" };
}

export async function getPlayback(videoId: string, currentUserId?: string) {
  const video = await Upload.where({ id: videoId, isDeleted: false })
    .include("channel", (c) =>
      c.select("id", "userId", "handle", "channelName", "profilePictureUrl"),
    )
    .include("videos", (v) => v.select("id", "resolution", "url"))
    .first();

  if (!video) {
    throw new AppError("Video not found.", 404, "VIDEO_NOT_FOUND");
  }

  // Server-side authorization check for private playback
  if (video.visibility === "PRIVATE") {
    if (!currentUserId || video.channel.userId !== currentUserId) {
      throw new AppError("This video is private.", 403, "PRIVATE_VIDEO");
    }
  }

  const isReady = video.processingStatus === "COMPLETED" && Boolean(video.hlsManifestUrl);

  return {
    videoId: video.id,
    title: video.title,
    description: video.description,
    thumbnailUrl: video.thumbnailUrl,
    streamType: video.hlsManifestUrl ? "HLS" : "DIRECT",
    hlsManifestUrl: video.hlsManifestUrl,
    manifestRoute: `/api/v1/videos/${video.id}/manifest`,
    processingStatus: video.processingStatus,
    isReady,
    visibility: video.visibility,
    renditions: (video.videos || []).map((v) => ({
      id: v.id,
      resolution: v.resolution,
      url: v.url,
    })),
    channel: video.channel
      ? {
          id: video.channel.id,
          handle: video.channel.handle,
          channelName: video.channel.channelName,
          profilePictureUrl: video.channel.profilePictureUrl,
        }
      : null,
  };
}

export async function getManifest(videoId: string, currentUserId?: string) {
  const video = await Upload.where({ id: videoId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();

  if (!video) {
    throw new AppError("Video not found.", 404, "VIDEO_NOT_FOUND");
  }

  // Authorization gate for private video manifests
  if (video.visibility === "PRIVATE") {
    if (!currentUserId || video.channel.userId !== currentUserId) {
      throw new AppError("This video is private.", 403, "PRIVATE_VIDEO");
    }
  }

  if (video.processingStatus !== "COMPLETED" || !video.hlsManifestUrl) {
    throw new AppError(
      video.processingStatus === "FAILED"
        ? "Video processing failed. HLS manifest is not available."
        : "Video is still processing. HLS manifest is not yet available.",
      video.processingStatus === "FAILED" ? 422 : 409,
      "MANIFEST_NOT_READY",
    );
  }

  return {
    videoId: video.id,
    manifestUrl: video.hlsManifestUrl,
    visibility: video.visibility,
  };
}

export async function likeVideo(videoId: string, userId: string) {
  return await interactionService.setInteraction(videoId, userId, { type: "LIKE" });
}

export async function unlikeVideo(videoId: string, userId: string) {
  return await interactionService.removeInteraction(videoId, userId);
}

export async function getVideoLikeStatus(videoId: string, userId?: string) {
  return await interactionService.getInteractionCounts(videoId, userId);
}

import * as storageService from "../../services/storageService";
import { isStorageConfigured, STORAGE_THUMBNAILS_BUCKET } from "../../config/config";

export async function getThumbnailPresignedUrl(
  videoId: string,
  input: { fileName: string; contentType: string },
  userId: string,
) {
  const video = await Upload.where({ id: videoId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();

  if (!video) {
    throw new AppError("Video not found.", 404);
  }

  if (video.channel.userId !== userId) {
    throw new AppError("Unauthorized.", 403);
  }

  if (!isStorageConfigured()) {
    throw new AppError(
      "Storage service is not configured. Please verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      500,
      "STORAGE_NOT_CONFIGURED",
    );
  }

  const key = storageService.generateThumbnailKey(video.channel.id, videoId, input.fileName);
  const signed = await storageService.createSignedUploadUrl(STORAGE_THUMBNAILS_BUCKET, key);
  const publicUrl = storageService.getPublicUrl(STORAGE_THUMBNAILS_BUCKET, key);

  return {
    videoId,
    uploadUrl: signed.signedUrl,
    publicUrl,
    key,
    bucket: STORAGE_THUMBNAILS_BUCKET,
    token: signed.token,
    headers: { "Content-Type": input.contentType },
  };
}


export async function finalizeThumbnail(
  videoId: string,
  thumbnailUrl: string,
  userId: string,
) {
  const video = await Upload.where({ id: videoId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();

  if (!video) {
    throw new AppError("Video not found.", 404);
  }

  if (video.channel.userId !== userId) {
    throw new AppError("Unauthorized.", 403);
  }

  const updated = await Upload.where({ id: videoId }).update({ thumbnailUrl });
  return updated;
}
