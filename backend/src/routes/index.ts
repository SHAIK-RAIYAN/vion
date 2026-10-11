import { Router } from "express";
import authRouter from "../modules/auth/auth.routes";
import userRouter from "../modules/user/user.routes";
import channelRouter from "../modules/channel/channel.routes";
import uploadRouter from "../modules/upload/upload.routes";
import videoRouter from "../modules/video/video.routes";
import commentRouter from "../modules/comment/comment.routes";
import watchHistoryRouter from "../modules/watchHistory/watchHistory.routes";
import feedRouter from "../modules/feed/feed.routes";
import searchRouter from "../modules/search/search.routes";
import categoryRouter from "../modules/categories/categories.routes";
import notificationRouter from "../modules/notifications/notifications.routes";
import adminRouter from "../modules/admin/admin.routes";
import healthRouter from "../modules/health/health.routes";
import internalUploadRouter from "../modules/internal/internal.routes";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// Canonical API Contract routes as defined in vion_plan.md
router.use("/auth", authRouter);
router.use("/users", authMiddleware, userRouter);
router.use("/channels", channelRouter);
router.use("/uploads", uploadRouter);
router.use("/videos", videoRouter);
router.use("/comments", commentRouter);
router.use("/history", watchHistoryRouter);
router.use("/feed", feedRouter);
router.use("/search", searchRouter);
router.use("/categories", categoryRouter);
router.use("/notifications", authMiddleware, notificationRouter);
router.use("/admin", authMiddleware, adminRouter);
router.use("/health", healthRouter);
router.use("/internal/uploads", internalUploadRouter);

export default router;
