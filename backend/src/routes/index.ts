import { Router } from "express";
import authRouter from "../modules/auth/auth.routes";
import userRouter from "../modules/user/user.routes";
import channelRouter from "../modules/channel/channel.routes";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

router.use("/auth", authRouter);

router.use("/user", authMiddleware, userRouter);

router.use("/channel", channelRouter);

export default router;
