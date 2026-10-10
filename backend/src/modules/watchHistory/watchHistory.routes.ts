import { Router } from "express";
import {
  recordProgress,
  getWatchHistory,
  removeFromWatchHistory,
  clearWatchHistory,
} from "./watchHistory.controller";
import { authMiddleware } from "../../middlewares/authMiddleware";

const router = Router();

// All watch history endpoints require authentication
router.use(authMiddleware);

router.post("/", recordProgress);
router.get("/", getWatchHistory);
router.delete("/clear", clearWatchHistory);
router.delete("/:uploadId", removeFromWatchHistory);

export default router;
