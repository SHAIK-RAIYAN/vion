import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../utils/AppError";
import * as uploadService from "./upload.service";

const createUpload = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const upload = await uploadService.createUpload(req.body, req.user.id);
  res.status(201).json({
    success: true,
    message: "Upload session created successfully",
    data: upload,
  });
});

const createPresignedUrl = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const result = await uploadService.createPresignedUrl(req.body, req.user.id);
  res.status(201).json({
    success: true,
    message: "Presigned upload URL generated successfully",
    data: result,
  });
});

const createRemoteUrl = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const result = await uploadService.createRemoteUrlUpload(req.body, req.user.id);
  res.status(201).json({
    success: true,
    message: "Remote URL upload registered successfully",
    data: result,
  });
});

const getUploadById = asyncHandler(async (req: Request, res: Response) => {
  const { uploadId, id } = req.params;
  const targetId = uploadId || id;
  if (!targetId || typeof targetId !== "string") {
    throw new AppError("Upload ID is required.", 400);
  }

  const upload = await uploadService.getUploadById(targetId, req.user?.id);
  res.status(200).json({
    success: true,
    message: "Upload fetched successfully",
    data: upload,
  });
});

const getUploadStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { uploadId, id } = req.params;
  const targetId = uploadId || id;
  if (!targetId || typeof targetId !== "string") {
    throw new AppError("Upload ID is required.", 400);
  }

  // Prevent 304 Not Modified caching from masking live progress transitions during polling
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
    "Surrogate-Control": "no-store",
  });
  // Disable conditional ETag / timestamp checks so fresh JSON body is always returned
  req.headers["if-none-match"] = undefined;
  req.headers["if-modified-since"] = undefined;

  const status = await uploadService.getUploadStatus(targetId, req.user.id);
  res.status(200).json({
    success: true,
    message: "Upload status fetched successfully",
    data: status,
  });
});

const updateUpload = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { uploadId, id } = req.params;
  const targetId = uploadId || id;
  if (!targetId || typeof targetId !== "string") {
    throw new AppError("Upload ID is required.", 400);
  }

  const upload = await uploadService.updateUpload(targetId, req.body, req.user.id);
  res.status(200).json({
    success: true,
    message: "Upload metadata updated successfully",
    data: upload,
  });
});

const finalizeUpload = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { uploadId, id } = req.params;
  const targetId = uploadId || id;
  if (!targetId || typeof targetId !== "string") {
    throw new AppError("Upload ID is required.", 400);
  }

  const result = await uploadService.finalizeUpload(targetId, req.user.id, req.body?.storageKey);
  res.status(200).json({
    success: true,
    message: result.message,
    data: result,
  });
});

const deleteUpload = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { uploadId, id } = req.params;
  const targetId = uploadId || id;
  if (!targetId || typeof targetId !== "string") {
    throw new AppError("Upload ID is required.", 400);
  }

  const result = await uploadService.deleteUpload(targetId, req.user.id);
  res.status(200).json({
    success: true,
    message: result.message,
    data: null,
  });
});

export {
  createUpload,
  createPresignedUrl,
  createRemoteUrl,
  getUploadById,
  getUploadStatus,
  updateUpload,
  finalizeUpload,
  deleteUpload,
};

