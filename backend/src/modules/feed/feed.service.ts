import { db } from "../../prisma/db";
import { getPaginationMeta, type Pagination } from "../../utils/pagination";

const { Upload, Subscription } = db.orm.public;

export async function getFeed(
  pagination: Pagination & { cursor?: string; feed?: "all" | "subscriptions" },
  currentUserId?: string,
) {
  const { page, limit, cursor, feed } = pagination;
  const offset = (page - 1) * limit;

  let subscribedChannelIds: string[] | null = null;
  if (feed === "subscriptions") {
    if (!currentUserId) {
      return {
        items: [],
        nextCursor: null,
        pagination: getPaginationMeta(0, page, limit),
      };
    }
    const userSubs = await Subscription.where({ subscriberId: currentUserId }).all();
    subscribedChannelIds = userSubs.map((s) => s.channelId);
    if (subscribedChannelIds.length === 0) {
      return {
        items: [],
        nextCursor: null,
        pagination: getPaginationMeta(0, page, limit),
      };
    }
  }

  let cursorCreatedAt: string | null = null;
  if (cursor) {
    const cursorUpload = await Upload.where({ id: cursor }).first();
    if (cursorUpload) {
      cursorCreatedAt = cursorUpload.createdAt;
    }
  }

  let baseQuery = Upload.where({
    isDeleted: false,
    visibility: "PUBLIC",
    processingStatus: "COMPLETED",
  });

  if (subscribedChannelIds) {
    baseQuery = baseQuery.where((u) => u.channelId.in(subscribedChannelIds!));
  }

  const queryWithCursor = cursorCreatedAt
    ? baseQuery.where((u) => u.createdAt.lt(cursorCreatedAt!))
    : baseQuery;

  const items = await queryWithCursor
    .include("channel", (c) =>
      c.select("id", "handle", "channelName", "profilePictureUrl"),
    )
    .include("videos", (v) => v.select("id", "resolution", "url"))
    .include("comments", (c) => c.count())
    .include("interactions", (i) => i.count())
    .orderBy([(u) => u.createdAt.desc(), (u) => u.id.desc()])
    .limit(limit)
    .offset(cursor ? 0 : offset)
    .all();

  // Fast path: if on page 1 and fewer than limit returned, total count is exact items length
  let totalCount = items.length;
  if (page > 1 || items.length === limit) {
    const countResult = await baseQuery.aggregate((agg) => ({
      count: agg.count(),
    }));
    totalCount = countResult.count;
  }

  const nextCursor =
    items.length === limit && items[items.length - 1]
      ? items[items.length - 1]!.id
      : null;

  return {
    items,
    nextCursor,
    pagination: getPaginationMeta(totalCount, page, limit),
  };
}
