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

export async function publishVideo(input: PublishVideoInput, userId: string) {
  const data = publishVideoSchema.parse(input);

  const channel = await Channel.where({ userId }).first();
  if (!channel) {
    throw new AppError("Channel not found for this user.", 404);
  }

  const upload = await Upload.where({ id: data.uploadId, isDeleted: false }).first();
  if (!upload) {
    throw new AppError("Upload record not found.", 404);
  }

  if (upload.channelId !== channel.id) {
    throw new AppError("You do not own this upload.", 403);
  }

  const published = await Upload.where({ id: data.uploadId }).update({
    ...(data.title ? { title: data.title } : {}),
    ...(data.description !== undefined ? { description: data.description || null } : {}),
    ...(data.thumbnailUrl !== undefined ? { thumbnailUrl: data.thumbnailUrl || null } : {}),
    visibility: data.visibility || "PUBLIC",
    processingStatus: "COMPLETED",
  });

  return published;
}

export async function getVideoById(videoId: string, currentUserId?: string) {
  const video = await Upload.where({ id: videoId, isDeleted: false })
    .include("channel", (c) =>
      c.select("id", "userId", "handle", "channelName", "profilePictureUrl"),
    )
    .include("videos", (v) => v.select("id", "resolution", "url"))
    .include("comments", (c) => c.count())
    .include("interactions", (i) => i.count())
    .first();

  if (!video) {
    throw new AppError("Video not found.", 404);
  }

  if (video.visibility === "PRIVATE") {
    if (!currentUserId || video.channel.userId !== currentUserId) {
      throw new AppError("This video is private.", 403);
    }
  }

  // Increment view count
  const updatedViewCount = video.viewCount + 1;
  await Upload.where({ id: videoId }).update({ viewCount: updatedViewCount });

  return {
    ...video,
    viewCount: updatedViewCount,
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
    throw new AppError("Video not found.", 404);
  }

  if (video.channel.userId !== userId) {
    throw new AppError("You do not have permission to update this video.", 403);
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
    throw new AppError("Video not found.", 404);
  }

  if (video.channel.userId !== userId) {
    throw new AppError("You do not have permission to delete this video.", 403);
  }

  await Upload.where({ id: videoId }).update({ isDeleted: true });

  return { message: "Video deleted successfully" };
}

export async function getPlayback(videoId: string, currentUserId?: string) {
  const video = await Upload.where({ id: videoId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .include("videos", (v) => v.select("id", "resolution", "url"))
    .first();

  if (!video) {
    throw new AppError("Video not found.", 404);
  }

  if (video.visibility === "PRIVATE") {
    if (!currentUserId || video.channel.userId !== currentUserId) {
      throw new AppError("This video is private.", 403);
    }
  }

  return {
    videoId: video.id,
    title: video.title,
    streamType: video.hlsManifestUrl ? "HLS" : "DIRECT",
    hlsManifestUrl: video.hlsManifestUrl,
    renditions: video.videos || [],
  };
}

export async function getManifest(videoId: string) {
  const video = await Upload.where({ id: videoId, isDeleted: false }).first();
  if (!video) {
    throw new AppError("Video not found.", 404);
  }

  if (!video.hlsManifestUrl) {
    throw new AppError("HLS manifest not available for this video.", 404);
  }

  return {
    videoId: video.id,
    manifestUrl: video.hlsManifestUrl,
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

  const key = storageService.generateThumbnailKey(video.channel.id, videoId, input.fileName);
  let uploadUrl = "";
  let uploadToken = "";

  if (isStorageConfigured()) {
    try {
      const signed = await storageService.createSignedUploadUrl(STORAGE_THUMBNAILS_BUCKET, key);
      uploadUrl = signed.signedUrl;
      uploadToken = signed.token;
    } catch (err: any) {
      console.warn("Supabase Storage thumbnail signed URL warning:", err.message);
      uploadUrl = `https://storage.vion.local/${STORAGE_THUMBNAILS_BUCKET}/${key}`;
    }
  } else {
    uploadUrl = `https://storage.vion.local/${STORAGE_THUMBNAILS_BUCKET}/${key}`;
  }

  const publicUrl = isStorageConfigured()
    ? storageService.getPublicUrl(STORAGE_THUMBNAILS_BUCKET, key)
    : uploadUrl;

  return {
    videoId,
    uploadUrl,
    publicUrl,
    key,
    bucket: STORAGE_THUMBNAILS_BUCKET,
    token: uploadToken,
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
