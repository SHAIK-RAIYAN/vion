import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../utils/AppError";
import { paginationSchema } from "../../utils/pagination";
import * as watchHistoryService from "./watchHistory.service";

const recordProgress = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { videoId, uploadId } = req.params;
  const targetId = videoId || uploadId || req.body.uploadId || req.body.videoId;

  const record = await watchHistoryService.recordProgress(
    req.user.id,
    {
      videoId: targetId,
      progressTimeStamp: req.body.progressTimeStamp || 0,
    },
  );
  res.status(200).json({
    success: true,
    message: "Playback progress recorded successfully",
    data: record,
  });
});

const getVideoProgress = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { videoId } = req.params;
  if (!videoId || typeof videoId !== "string") {
    throw new AppError("Video ID is required.", 400);
  }

  const progress = await watchHistoryService.getVideoProgress(
    req.user.id,
    videoId,
  );
  res.status(200).json({
    success: true,
    message: "Video playback progress fetched successfully",
    data: progress,
  });
});

const getWatchHistory = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const pagination = paginationSchema.parse(req.query);
  const result = await watchHistoryService.getWatchHistory(
    req.user.id,
    pagination,
  );
  res.status(200).json({
    success: true,
    message: "Watch history fetched successfully",
    data: result,
    ...result,
  });
});

const removeFromWatchHistory = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError("Unauthorized.", 401);
    }

    const { videoId, uploadId } = req.params;
    const targetId = videoId || uploadId;
    if (!targetId || typeof targetId !== "string") {
      throw new AppError("Video ID is required.", 400);
    }

    const result = await watchHistoryService.removeFromWatchHistory(
      req.user.id,
      targetId,
    );
    res.status(200).json({
      success: true,
      message: result.message,
      data: null,
    });
  },
);

const clearWatchHistory = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const result = await watchHistoryService.clearWatchHistory(req.user.id);
  res.status(200).json({
    success: true,
    message: result.message,
    data: null,
  });
});

export {
  recordProgress,
  getVideoProgress,
  getWatchHistory,
  removeFromWatchHistory,
  clearWatchHistory,
};

