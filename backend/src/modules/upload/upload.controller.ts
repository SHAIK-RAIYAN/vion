import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../utils/AppError";
import { paginationSchema } from "../../utils/pagination";
import * as uploadService from "./upload.service";

const createUpload = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const upload = await uploadService.createUpload(req.body, req.user.id);
  res.status(201).json({
    message: "Video metadata created successfully",
    data: upload,
  });
});

const getUploadById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id || typeof id !== "string") {
    throw new AppError("Video ID is required.", 400);
  }

  const upload = await uploadService.getUploadById(id, req.user?.id);
  res.status(200).json({
    message: "Video fetched successfully",
    data: upload,
  });
});

const getPublicUploads = asyncHandler(async (req: Request, res: Response) => {
  const pagination = paginationSchema.parse(req.query);
  const result = await uploadService.getPublicUploads(pagination);
  res.status(200).json({
    message: "Videos fetched successfully",
    ...result,
  });
});

const getChannelUploads = asyncHandler(async (req: Request, res: Response) => {
  const { channelId } = req.params;
  if (!channelId || typeof channelId !== "string") {
    throw new AppError("Channel ID is required.", 400);
  }

  const pagination = paginationSchema.parse(req.query);
  const result = await uploadService.getChannelUploads(
    channelId,
    pagination,
    req.user?.id,
  );
  res.status(200).json({
    message: "Channel videos fetched successfully",
    ...result,
  });
});

const getMyUploads = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const pagination = paginationSchema.parse(req.query);
  const result = await uploadService.getMyUploads(req.user.id, pagination);
  res.status(200).json({
    message: "My videos fetched successfully",
    ...result,
  });
});

const updateUpload = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { id } = req.params;
  if (!id || typeof id !== "string") {
    throw new AppError("Video ID is required.", 400);
  }

  const upload = await uploadService.updateUpload(id, req.body, req.user.id);
  res.status(200).json({
    message: "Video updated successfully",
    data: upload,
  });
});

const deleteUpload = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { id } = req.params;
  if (!id || typeof id !== "string") {
    throw new AppError("Video ID is required.", 400);
  }

  const result = await uploadService.deleteUpload(id, req.user.id);
  res.status(200).json(result);
});

const addVideoResolution = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { id } = req.params;
  if (!id || typeof id !== "string") {
    throw new AppError("Video ID is required.", 400);
  }

  const video = await uploadService.addVideoResolution(
    id,
    req.body,
    req.user.id,
  );
  res.status(201).json({
    message: "Video resolution added successfully",
    data: video,
  });
});

export {
  createUpload,
  getUploadById,
  getPublicUploads,
  getChannelUploads,
  getMyUploads,
  updateUpload,
  deleteUpload,
  addVideoResolution,
};
