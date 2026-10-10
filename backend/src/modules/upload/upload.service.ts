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
    visibility: data.visibility,
    processingStatus: data.processingStatus,
  });

  return upload;
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
