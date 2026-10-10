import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { db } from "../../prisma/db";
import * as channelService from "./channel.service";

const createChannel = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new Error("No user data in Request.");
  }

  const channel = await channelService.createChannel(req.body, req.user.id);
});

export { createChannel };
