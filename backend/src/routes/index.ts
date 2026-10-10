import { Router } from "express";
import authRouter from "../modules/auth/auth.routes";
import userRouter from "../modules/user/user.routes";
import channelRouter from "../modules/channel/channel.routes";
import subscriptionRouter from "../modules/subscription/subscription.routes";
import uploadRouter from "../modules/upload/upload.routes";
import interactionRouter from "../modules/interaction/interaction.routes";
import commentRouter from "../modules/comment/comment.routes";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

router.use("/auth", authRouter);

router.use("/user", authMiddleware, userRouter);

router.use("/channel", channelRouter);

router.use("/subscription", subscriptionRouter);

router.use("/upload", uploadRouter);

router.use("/interaction", interactionRouter);

router.use("/comment", commentRouter);

export default router;
