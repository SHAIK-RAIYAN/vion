import { db } from "../../prisma/db";
import { AppError } from "../../utils/AppError";
import { getPaginationMeta, type Pagination } from "../../utils/pagination";
import {
  recordHistorySchema,
  type RecordHistoryInput,
} from "./watchHistory.schema";

const { WatchHistory, Upload } = db.orm.public;

export async function recordProgress(
  userId: string,
  input: { uploadId?: string; videoId?: string; progressTimeStamp: number },
) {
  const targetId = input.videoId || input.uploadId;
  if (!targetId) {
    throw new AppError("Video ID is required.", 400);
  }

  const upload = await Upload.where({ id: targetId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();
  if (!upload) {
    throw new AppError("Video not found.", 404, "VIDEO_NOT_FOUND");
  }

  // Authorization gate: Private videos cannot have watch history recorded by unauthorized users
  if (upload.visibility === "PRIVATE" && upload.channel.userId !== userId) {
    throw new AppError("This video is private.", 403, "PRIVATE_VIDEO");
  }

  const progress = Math.max(0, Math.floor(Number(input.progressTimeStamp) || 0));

  const existing = await WatchHistory.where({
    userId,
    uploadId: targetId,
  }).first();

  if (existing) {
    const updated = await WatchHistory.where({ id: existing.id }).update({
      progressTimeStamp: progress,
      watchedAt: new Date(),
    });
    return updated;
  }

  try {
    const created = await WatchHistory.create({
      userId,
      uploadId: targetId,
      progressTimeStamp: progress,
      watchedAt: new Date(),
    });
    return created;
  } catch (err: any) {
    // Handle concurrent unique constraint violation on @@unique([userId, uploadId])
    const raceRecord = await WatchHistory.where({
      userId,
      uploadId: targetId,
    }).first();
    if (raceRecord) {
      const updated = await WatchHistory.where({ id: raceRecord.id }).update({
        progressTimeStamp: progress,
        watchedAt: new Date(),
      });
      return updated;
    }
    throw err;
  }
}

export async function getVideoProgress(userId: string, videoId: string) {
  const upload = await Upload.where({ id: videoId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();
  if (!upload) {
    throw new AppError("Video not found.", 404, "VIDEO_NOT_FOUND");
  }

  if (upload.visibility === "PRIVATE" && upload.channel.userId !== userId) {
    throw new AppError("This video is private.", 403, "PRIVATE_VIDEO");
  }

  const existing = await WatchHistory.where({ userId, uploadId: videoId }).first();
  if (!existing) {
    return {
      videoId,
      progressTimeStamp: 0,
      watchedAt: null,
    };
  }

  return {
    videoId: existing.uploadId,
    progressTimeStamp: existing.progressTimeStamp,
    watchedAt: existing.watchedAt,
  };
}

export async function getWatchHistory(userId: string, pagination: Pagination) {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const [items, countResult] = await Promise.all([
    WatchHistory.where({ userId })
      .include("upload", (u) =>
        u
          .where({ isDeleted: false })
          .select("id", "title", "description", "thumbnailUrl", "viewCount", "createdAt")
          .include("channel", (c) =>
            c.select("id", "handle", "channelName", "profilePictureUrl"),
          ),
      )
      .orderBy([(w) => w.watchedAt.desc(), (w) => w.id.desc()])
      .limit(limit)
      .offset(offset)
      .all(),
    WatchHistory.where({ userId }).aggregate((agg) => ({
      count: agg.count(),
    })),
  ]);

  return {
    items,
    pagination: getPaginationMeta(countResult.count, page, limit),
  };
}

export async function removeFromWatchHistory(
  userId: string,
  uploadId: string,
) {
  const existing = await WatchHistory.where({ userId, uploadId }).first();
  if (!existing) {
    // Idempotent: repeated removals succeed predictably
    return { message: "Item removed from watch history successfully", success: true };
  }

  await WatchHistory.where({ id: existing.id }).delete();

  return { message: "Item removed from watch history successfully", success: true };
}

export async function clearWatchHistory(userId: string) {
  await WatchHistory.where({ userId }).delete();
  return { message: "Watch history cleared successfully", success: true };
}
