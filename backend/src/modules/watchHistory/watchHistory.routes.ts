import { Router } from "express";
import {
  recordProgress,
  getVideoProgress,
  getWatchHistory,
  removeFromWatchHistory,
  clearWatchHistory,
} from "./watchHistory.controller";
import { authMiddleware } from "../../middlewares/authMiddleware";

const router = Router();

// Section 11: WATCH HISTORY (All require auth)
router.use(authMiddleware);

router.get("/", getWatchHistory);
router.get("/:videoId", getVideoProgress);
router.put("/:videoId/progress", recordProgress);
router.delete("/:videoId", removeFromWatchHistory);
router.delete("/", clearWatchHistory);

export default router;

