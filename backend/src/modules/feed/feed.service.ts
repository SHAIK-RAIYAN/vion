import { db } from "../../prisma/db";
import { getPaginationMeta, type Pagination } from "../../utils/pagination";

const { Upload } = db.orm.public;

export async function getFeed(
  pagination: Pagination & { cursor?: string },
  currentUserId?: string,
) {
  const { page, limit, cursor } = pagination;
  const offset = (page - 1) * limit;

  let cursorCreatedAt: string | null = null;
  if (cursor) {
    const cursorUpload = await Upload.where({ id: cursor }).first();
    if (cursorUpload) {
      cursorCreatedAt = cursorUpload.createdAt;
    }
  }

  const baseQuery = Upload.where({
    isDeleted: false,
    visibility: "PUBLIC",
    processingStatus: "COMPLETED",
  });

  const queryWithCursor = cursorCreatedAt
    ? baseQuery.where((u) => u.createdAt.lt(cursorCreatedAt!))
    : baseQuery;

  const [items, countResult] = await Promise.all([
    queryWithCursor
      .include("channel", (c) =>
        c.select("id", "handle", "channelName", "profilePictureUrl"),
      )
      .include("videos", (v) => v.select("id", "resolution", "url"))
      .include("comments", (c) => c.count())
      .include("interactions", (i) => i.count())
      .orderBy([(u) => u.createdAt.desc(), (u) => u.id.desc()])
      .limit(limit)
      .offset(cursor ? 0 : offset)
      .all(),
    baseQuery.aggregate((agg) => ({
      count: agg.count(),
    })),
  ]);

  const nextCursor =
    items.length === limit && items[items.length - 1]
      ? items[items.length - 1]!.id
      : null;

  return {
    items,
    nextCursor,
    pagination: getPaginationMeta(countResult.count, page, limit),
  };
}
