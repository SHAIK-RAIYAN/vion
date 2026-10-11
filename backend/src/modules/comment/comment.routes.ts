import { Router } from "express";
import {
  getCommentById,
  updateComment,
  deleteComment,
} from "./comment.controller";
import { authMiddleware, optionalAuthMiddleware } from "../../middlewares/authMiddleware";

const router = Router();

// Section 10: COMMENTS (Specific comment item operations)
router.get("/:commentId", optionalAuthMiddleware, getCommentById);
router.patch("/:commentId", authMiddleware, updateComment);
router.delete("/:commentId", authMiddleware, deleteComment);

export default router;

