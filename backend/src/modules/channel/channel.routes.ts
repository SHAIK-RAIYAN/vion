import { Router } from "express";
import {
  createChannel,
  getMyChannel,
  getChannelById,
  getChannelByHandle,
  updateChannel,
  deleteMyChannel,
} from "./channel.controller";
import {
  subscribe,
  unsubscribe,
  getSubscriptionStatus,
  getChannelSubscribers,
} from "../subscription/subscription.controller";
import { authMiddleware } from "../../middlewares/authMiddleware";

const router = Router();

// Channel management
router.post("/", authMiddleware, createChannel);
router.get("/me", authMiddleware, getMyChannel);
router.patch("/me", authMiddleware, updateChannel);
router.delete("/me", authMiddleware, deleteMyChannel);

// Public channel discovery
router.get("/handle/:handle", getChannelByHandle);
router.get("/:channelId", getChannelById);

// Subscriptions on channels (canonical Section 4)
router.post("/:channelId/subscription", authMiddleware, subscribe);
router.post("/:channelId/subscribe", authMiddleware, subscribe);
router.delete("/:channelId/subscription", authMiddleware, unsubscribe);
router.delete("/:channelId/subscribe", authMiddleware, unsubscribe);
router.get("/:channelId/subscription", authMiddleware, getSubscriptionStatus);
router.get("/:channelId/subscribers", getChannelSubscribers);

export default router;

