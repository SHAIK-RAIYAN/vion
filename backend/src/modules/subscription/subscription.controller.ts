import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../utils/AppError";
import { paginationSchema } from "../../utils/pagination";
import * as subscriptionService from "./subscription.service";

const subscribe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { channelId } = req.params;
  if (!channelId || typeof channelId !== "string") {
    throw new AppError("Channel ID is required.", 400);
  }

  const subscription = await subscriptionService.subscribe(
    channelId,
    req.user.id,
  );
  res.status(201).json({
    success: true,
    message: "Subscribed successfully",
    data: subscription,
  });
});

const unsubscribe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { channelId } = req.params;
  if (!channelId || typeof channelId !== "string") {
    throw new AppError("Channel ID is required.", 400);
  }

  const result = await subscriptionService.unsubscribe(
    channelId,
    req.user.id,
  );
  res.status(200).json({
    success: true,
    message: "Unsubscribed successfully",
    data: result,
  });
});

const toggleSubscription = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { channelId } = req.params;
  if (!channelId || typeof channelId !== "string") {
    throw new AppError("Channel ID is required.", 400);
  }

  const result = await subscriptionService.toggleSubscription(
    channelId,
    req.user.id,
  );
  res.status(200).json({
    success: true,
    message: result.isSubscribed
      ? "Subscribed successfully"
      : "Unsubscribed successfully",
    data: result,
  });
});

const getSubscriptionStatus = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError("Unauthorized.", 401);
    }

    const { channelId } = req.params;
    if (!channelId || typeof channelId !== "string") {
      throw new AppError("Channel ID is required.", 400);
    }

    const status = await subscriptionService.checkSubscriptionStatus(
      channelId,
      req.user.id,
    );
    res.status(200).json({
      success: true,
      message: "Subscription status fetched successfully",
      data: status,
    });
  },
);

const getMySubscriptions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const pagination = paginationSchema.parse(req.query);
  const result = await subscriptionService.getMySubscriptions(
    req.user.id,
    pagination,
  );
  res.status(200).json({
    success: true,
    message: "Subscriptions fetched successfully",
    data: result,
    ...result,
  });
});

const getChannelSubscribers = asyncHandler(
  async (req: Request, res: Response) => {
    const { channelId } = req.params;
    if (!channelId || typeof channelId !== "string") {
      throw new AppError("Channel ID is required.", 400);
    }

    const pagination = paginationSchema.parse(req.query);
    const result = await subscriptionService.getChannelSubscribers(
      channelId,
      pagination,
    );
    res.status(200).json({
      success: true,
      message: "Channel subscribers fetched successfully",
      data: result,
      ...result,
    });
  },
);


export {
  subscribe,
  unsubscribe,
  toggleSubscription,
  getSubscriptionStatus,
  getMySubscriptions,
  getChannelSubscribers,
};
