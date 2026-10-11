import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../utils/AppError";
import { paginationSchema } from "../../utils/pagination";
import * as commentService from "./comment.service";

const createComment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { videoId, uploadId } = req.params;
  const targetId = videoId || uploadId;
  if (!targetId || typeof targetId !== "string") {
    throw new AppError("Video ID is required.", 400);
  }

  const comment = await commentService.createComment(
    targetId,
    req.user.id,
    req.body,
  );
  res.status(201).json({
    success: true,
    message: "Comment created successfully",
    data: comment,
  });
});

const getCommentsByUpload = asyncHandler(
  async (req: Request, res: Response) => {
    const { videoId, uploadId } = req.params;
    const targetId = videoId || uploadId;
    if (!targetId || typeof targetId !== "string") {
      throw new AppError("Video ID is required.", 400);
    }

    const pagination = paginationSchema.parse(req.query);
    const result = await commentService.getCommentsByUpload(
      targetId,
      pagination,
    );
    res.status(200).json({
      success: true,
      message: "Comments fetched successfully",
      data: result,
      ...result,
    });
  },
);

const getCommentById = asyncHandler(async (req: Request, res: Response) => {
  const { commentId } = req.params;
  if (!commentId || typeof commentId !== "string") {
    throw new AppError("Comment ID is required.", 400);
  }

  const comment = await commentService.getCommentById(commentId);
  res.status(200).json({
    success: true,
    message: "Comment fetched successfully",
    data: comment,
  });
});

const updateComment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { commentId } = req.params;
  if (!commentId || typeof commentId !== "string") {
    throw new AppError("Comment ID is required.", 400);
  }

  const comment = await commentService.updateComment(
    commentId,
    req.user.id,
    req.body,
  );
  res.status(200).json({
    success: true,
    message: "Comment updated successfully",
    data: comment,
  });
});

const deleteComment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { commentId } = req.params;
  if (!commentId || typeof commentId !== "string") {
    throw new AppError("Comment ID is required.", 400);
  }

  const result = await commentService.deleteComment(commentId, req.user.id);
  res.status(200).json({
    success: true,
    message: result.message,
    data: null,
  });
});

export {
  createComment,
  getCommentsByUpload,
  getCommentById,
  updateComment,
  deleteComment,
};

