import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../utils/AppError";
import { paginationSchema } from "../../utils/pagination";
import * as commentService from "./comment.service";

const createComment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { uploadId } = req.params;
  if (!uploadId || typeof uploadId !== "string") {
    throw new AppError("Upload ID is required.", 400);
  }

  const comment = await commentService.createComment(
    uploadId,
    req.user.id,
    req.body,
  );
  res.status(201).json({
    message: "Comment created successfully",
    data: comment,
  });
});

const getCommentsByUpload = asyncHandler(
  async (req: Request, res: Response) => {
    const { uploadId } = req.params;
    if (!uploadId || typeof uploadId !== "string") {
      throw new AppError("Upload ID is required.", 400);
    }

    const pagination = paginationSchema.parse(req.query);
    const result = await commentService.getCommentsByUpload(
      uploadId,
      pagination,
    );
    res.status(200).json({
      message: "Comments fetched successfully",
      ...result,
    });
  },
);

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
  res.status(200).json(result);
});

export {
  createComment,
  getCommentsByUpload,
  updateComment,
  deleteComment,
};
