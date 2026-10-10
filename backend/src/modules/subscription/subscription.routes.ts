import { Router } from "express";
import {
  subscribe,
  unsubscribe,
  toggleSubscription,
  getSubscriptionStatus,
  getMySubscriptions,
  getChannelSubscribers,
} from "./subscription.controller";
import { authMiddleware } from "../../middlewares/authMiddleware";

const router = Router();

// User subscriptions
router.get("/my", authMiddleware, getMySubscriptions);

// Channel subscribers (public)
router.get("/channel/:channelId", getChannelSubscribers);

// Subscription status & toggle/actions (requires auth)
router.get("/:channelId/status", authMiddleware, getSubscriptionStatus);
router.post("/:channelId/toggle", authMiddleware, toggleSubscription);
router.post("/:channelId", authMiddleware, subscribe);
router.delete("/:channelId", authMiddleware, unsubscribe);

export default router;
