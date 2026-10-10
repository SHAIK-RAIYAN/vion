import { Router } from "express";
import {
  setInteraction,
  removeInteraction,
  getInteractionCounts,
  getMyLikedVideos,
} from "./interaction.controller";
import {
  authMiddleware,
  optionalAuthMiddleware,
} from "../../middlewares/authMiddleware";

const router = Router();

// My liked videos (must come before /:uploadId)
router.get("/my/likes", authMiddleware, getMyLikedVideos);

// Video interaction counts and user status
router.get("/:uploadId", optionalAuthMiddleware, getInteractionCounts);

// Set (or toggle) like/dislike
router.post("/:uploadId", authMiddleware, setInteraction);

// Remove interaction
router.delete("/:uploadId", authMiddleware, removeInteraction);

export default router;
