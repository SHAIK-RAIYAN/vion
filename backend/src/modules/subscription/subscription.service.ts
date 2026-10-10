import { db } from "../../prisma/db";
import { AppError } from "../../utils/AppError";
import { getPaginationMeta, type Pagination } from "../../utils/pagination";

const { Subscription, Channel } = db.orm.public;

export async function subscribe(channelId: string, subscriberId: string) {
  const channel = await Channel.first({ id: channelId });
  if (!channel) {
    throw new AppError("Channel not found.", 404);
  }

  if (channel.userId === subscriberId) {
    throw new AppError("You cannot subscribe to your own channel.", 400);
  }

  const existing = await Subscription.where({ channelId, subscriberId }).first();
  if (existing) {
    throw new AppError("Already subscribed to this channel.", 409);
  }

  const subscription = await Subscription.create({
    channelId,
    subscriberId,
  });

  return subscription;
}

export async function unsubscribe(channelId: string, subscriberId: string) {
  const existing = await Subscription.where({ channelId, subscriberId }).first();
  if (!existing) {
    throw new AppError("Not subscribed to this channel.", 404);
  }

  await Subscription.where({ id: existing.id }).delete();
  return { success: true };
}

export async function toggleSubscription(
  channelId: string,
  subscriberId: string,
) {
  const channel = await Channel.first({ id: channelId });
  if (!channel) {
    throw new AppError("Channel not found.", 404);
  }

  if (channel.userId === subscriberId) {
    throw new AppError("You cannot subscribe to your own channel.", 400);
  }

  const existing = await Subscription.where({ channelId, subscriberId }).first();
  if (existing) {
    await Subscription.where({ id: existing.id }).delete();
    return { isSubscribed: false };
  } else {
    await Subscription.create({
      channelId,
      subscriberId,
    });
    return { isSubscribed: true };
  }
}

export async function checkSubscriptionStatus(
  channelId: string,
  subscriberId: string,
) {
  const existing = await Subscription.where({ channelId, subscriberId }).first();
  return { isSubscribed: Boolean(existing) };
}

export async function getMySubscriptions(
  subscriberId: string,
  pagination: Pagination,
) {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const [items, countResult] = await Promise.all([
    Subscription.where({ subscriberId })
      .include("channel", (c) =>
        c.select("id", "handle", "channelName", "profilePictureUrl", "description"),
      )
      .orderBy((s) => s.createdAt.desc())
      .limit(limit)
      .offset(offset)
      .all(),
    Subscription.where({ subscriberId }).aggregate((agg) => ({
      count: agg.count(),
    })),
  ]);

  return {
    items,
    pagination: getPaginationMeta(countResult.count, page, limit),
  };
}

export async function getChannelSubscribers(
  channelId: string,
  pagination: Pagination,
) {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const [items, countResult] = await Promise.all([
    Subscription.where({ channelId })
      .include("subscriber", (s) =>
        s.select("id", "firstName", "lastName"),
      )
      .orderBy((s) => s.createdAt.desc())
      .limit(limit)
      .offset(offset)
      .all(),
    Subscription.where({ channelId }).aggregate((agg) => ({
      count: agg.count(),
    })),
  ]);

  return {
    items,
    pagination: getPaginationMeta(countResult.count, page, limit),
  };
}
