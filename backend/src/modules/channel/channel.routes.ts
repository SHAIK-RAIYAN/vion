import { Router } from "express";
import { createChannel } from "./channel.controller";

const router = Router();

router.post("/", createChannel);

export default router;
