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
    // Idempotent: Repeated subscribe requests return the active subscription predictably
    return existing;
  }

  try {
    const subscription = await Subscription.create({
      channelId,
      subscriberId,
    });
    return subscription;
  } catch (err: any) {
    // Under concurrent race conditions where two requests hit create() simultaneously,
    // handle unique constraint violation ([channelId, subscriberId]) by returning the record
    const raceRecord = await Subscription.where({ channelId, subscriberId }).first();
    if (raceRecord) {
      return raceRecord;
    }
    throw err;
  }
}

export async function unsubscribe(channelId: string, subscriberId: string) {
  const channel = await Channel.first({ id: channelId });
  if (!channel) {
    throw new AppError("Channel not found.", 404);
  }

  const existing = await Subscription.where({ channelId, subscriberId }).first();
  if (!existing) {
    // Idempotent: Repeated unsubscribe calls return predictable success state
    return { success: true, unsubscribed: false };
  }

  await Subscription.where({ id: existing.id }).delete();
  return { success: true, unsubscribed: true };
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
      .orderBy([(s) => s.createdAt.desc(), (s) => s.id.desc()])
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
      .orderBy([(s) => s.createdAt.desc(), (s) => s.id.desc()])
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
