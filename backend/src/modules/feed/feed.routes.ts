import { Router } from "express";
import { getFeed } from "./feed.controller";
import { optionalAuthMiddleware } from "../../middlewares/authMiddleware";

const router = Router();

// Section 12: FEED
router.get("/", optionalAuthMiddleware, getFeed);

export default router;
