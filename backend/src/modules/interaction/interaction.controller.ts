import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../utils/AppError";
import { paginationSchema } from "../../utils/pagination";
import * as interactionService from "./interaction.service";

const setInteraction = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { uploadId } = req.params;
  if (!uploadId || typeof uploadId !== "string") {
    throw new AppError("Upload ID is required.", 400);
  }

  const result = await interactionService.setInteraction(
    uploadId,
    req.user.id,
    req.body,
  );
  res.status(200).json({
    message: `Interaction ${result.status.toLowerCase()} successfully`,
    data: result,
  });
});

const removeInteraction = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { uploadId } = req.params;
  if (!uploadId || typeof uploadId !== "string") {
    throw new AppError("Upload ID is required.", 400);
  }

  const result = await interactionService.removeInteraction(
    uploadId,
    req.user.id,
  );
  res.status(200).json(result);
});

const getInteractionCounts = asyncHandler(
  async (req: Request, res: Response) => {
    const { uploadId } = req.params;
    if (!uploadId || typeof uploadId !== "string") {
      throw new AppError("Upload ID is required.", 400);
    }

    const data = await interactionService.getInteractionCounts(
      uploadId,
      req.user?.id,
    );
    res.status(200).json({
      message: "Interaction counts fetched successfully",
      data,
    });
  },
);

const getMyLikedVideos = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const pagination = paginationSchema.parse(req.query);
  const result = await interactionService.getMyLikedVideos(
    req.user.id,
    pagination,
  );
  res.status(200).json({
    message: "Liked videos fetched successfully",
    ...result,
  });
});

export {
  setInteraction,
  removeInteraction,
  getInteractionCounts,
  getMyLikedVideos,
};
