import { Router } from "express";
import {
  createChannel,
  getMyChannel,
  getChannelById,
  getChannelByHandle,
  updateChannel,
} from "./channel.controller";
import { authMiddleware } from "../../middlewares/authMiddleware";

const router = Router();

// Protected routes (channel owner)
router.post("/", authMiddleware, createChannel);
router.get("/me", authMiddleware, getMyChannel);
router.patch("/", authMiddleware, updateChannel);

// Public routes
router.get("/handle/:handle", getChannelByHandle);
router.get("/:id", getChannelById);

export default router;
