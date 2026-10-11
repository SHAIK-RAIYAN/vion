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

  const upload = await Upload.where({ id: targetId, isDeleted: false }).first();
  if (!upload) {
    throw new AppError("Video not found.", 404);
  }

  const existing = await WatchHistory.where({
    userId,
    uploadId: targetId,
  }).first();

  if (existing) {
    const updated = await WatchHistory.where({ id: existing.id }).update({
      progressTimeStamp: input.progressTimeStamp || 0,
      watchedAt: new Date(),
    });
    return updated;
  }

  const created = await WatchHistory.create({
    userId,
    uploadId: targetId,
    progressTimeStamp: input.progressTimeStamp || 0,
    watchedAt: new Date(),
  });

  return created;
}

export async function getVideoProgress(userId: string, videoId: string) {
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
      .orderBy((w) => w.watchedAt.desc())
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
    throw new AppError("Watch history record not found.", 404);
  }

  await WatchHistory.where({ id: existing.id }).delete();

  return { message: "Item removed from watch history successfully" };
}

export async function clearWatchHistory(userId: string) {
  await WatchHistory.where({ userId }).delete();
  return { message: "Watch history cleared successfully" };
}
