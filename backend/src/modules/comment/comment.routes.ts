import { Router } from "express";
import {
  createComment,
  getCommentsByUpload,
  updateComment,
  deleteComment,
} from "./comment.controller";
import { authMiddleware } from "../../middlewares/authMiddleware";

const router = Router();

// Upload-scoped comment endpoints
router.get("/upload/:uploadId", getCommentsByUpload);
router.post("/upload/:uploadId", authMiddleware, createComment);

// Comment-specific endpoints
router.patch("/:commentId", authMiddleware, updateComment);
router.delete("/:commentId", authMiddleware, deleteComment);

export default router;
