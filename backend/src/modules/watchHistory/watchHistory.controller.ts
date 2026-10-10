import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../utils/AppError";
import { paginationSchema } from "../../utils/pagination";
import * as watchHistoryService from "./watchHistory.service";

const recordProgress = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const record = await watchHistoryService.recordProgress(
    req.user.id,
    req.body,
  );
  res.status(200).json({
    message: "Playback progress recorded successfully",
    data: record,
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
    message: "Watch history fetched successfully",
    ...result,
  });
});

const removeFromWatchHistory = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError("Unauthorized.", 401);
    }

    const { uploadId } = req.params;
    if (!uploadId || typeof uploadId !== "string") {
      throw new AppError("Upload ID is required.", 400);
    }

    const result = await watchHistoryService.removeFromWatchHistory(
      req.user.id,
      uploadId,
    );
    res.status(200).json(result);
  },
);

const clearWatchHistory = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const result = await watchHistoryService.clearWatchHistory(req.user.id);
  res.status(200).json(result);
});

export {
  recordProgress,
  getWatchHistory,
  removeFromWatchHistory,
  clearWatchHistory,
};
