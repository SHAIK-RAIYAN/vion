import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../utils/AppError";
import * as channelService from "./channel.service";

const createChannel = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const channel = await channelService.createChannel(req.body, req.user.id);
  res.status(201).json({
    message: "Channel created successfully",
    data: channel,
  });
});

const getMyChannel = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const channel = await channelService.getMyChannel(req.user.id);
  res.status(200).json({
    message: "Channel fetched successfully",
    data: channel,
  });
});

const getChannelById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id || typeof id !== "string") {
    throw new AppError("Channel ID is required.", 400);
  }

  const channel = await channelService.getChannelById(id);
  res.status(200).json({
    message: "Channel fetched successfully",
    data: channel,
  });
});

const getChannelByHandle = asyncHandler(async (req: Request, res: Response) => {
  const { handle } = req.params;
  if (!handle || typeof handle !== "string") {
    throw new AppError("Channel handle is required.", 400);
  }

  const channel = await channelService.getChannelByHandle(handle);
  res.status(200).json({
    message: "Channel fetched successfully",
    data: channel,
  });
});

const updateChannel = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const updatedChannel = await channelService.updateChannel(req.body, req.user.id);
  res.status(200).json({
    message: "Channel updated successfully",
    data: updatedChannel,
  });
});

export {
  createChannel,
  getMyChannel,
  getChannelById,
  getChannelByHandle,
  updateChannel,
};
