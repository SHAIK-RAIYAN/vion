import { Router } from "express";
import {
  createUpload,
  createPresignedUrl,
  createRemoteUrl,
  getUploadById,
  getUploadStatus,
  updateUpload,
  finalizeUpload,
  deleteUpload,
} from "./upload.controller";
import { authMiddleware } from "../../middlewares/authMiddleware";

const router = Router();

// Canonical Section 5: UPLOADS
router.post("/", authMiddleware, createUpload);
router.post("/presigned-url", authMiddleware, createPresignedUrl);
router.post("/remote-url", authMiddleware, createRemoteUrl);
router.get("/:uploadId", authMiddleware, getUploadById);
router.get("/:uploadId/status", authMiddleware, getUploadStatus);
router.patch("/:uploadId", authMiddleware, updateUpload);
router.post("/:uploadId/finalize", authMiddleware, finalizeUpload);
router.delete("/:uploadId", authMiddleware, deleteUpload);

export default router;

