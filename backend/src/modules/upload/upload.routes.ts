import { Router } from "express";
import {
  createUpload,
  getUploadById,
  getPublicUploads,
  getChannelUploads,
  getMyUploads,
  updateUpload,
  deleteUpload,
  addVideoResolution,
} from "./upload.controller";
import {
  authMiddleware,
  optionalAuthMiddleware,
} from "../../middlewares/authMiddleware";

const router = Router();

// Feed / Public uploads
router.get("/", getPublicUploads);

// Current user's uploads (before /:id)
router.get("/my", authMiddleware, getMyUploads);

// Channel uploads
router.get("/channel/:channelId", optionalAuthMiddleware, getChannelUploads);

// Single video view with visibility logic
router.get("/:id", optionalAuthMiddleware, getUploadById);

// Protected video operations
router.post("/", authMiddleware, createUpload);
router.patch("/:id", authMiddleware, updateUpload);
router.delete("/:id", authMiddleware, deleteUpload);
router.post("/:id/videos", authMiddleware, addVideoResolution);

export default router;
