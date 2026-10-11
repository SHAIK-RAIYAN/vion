import { db } from "../../prisma/db";
import { getPaginationMeta, type Pagination } from "../../utils/pagination";

const { Upload } = db.orm.public;

export async function getFeed(pagination: Pagination, currentUserId?: string) {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const [items, countResult] = await Promise.all([
    Upload.where({ isDeleted: false, visibility: "PUBLIC", processingStatus: "COMPLETED" })
      .include("channel", (c) =>
        c.select("id", "handle", "channelName", "profilePictureUrl"),
      )
      .include("videos", (v) => v.select("id", "resolution", "url"))
      .include("comments", (c) => c.count())
      .include("interactions", (i) => i.count())
      .orderBy((u) => u.createdAt.desc())
      .limit(limit)
      .offset(offset)
      .all(),
    Upload.where({ isDeleted: false, visibility: "PUBLIC", processingStatus: "COMPLETED" }).aggregate((agg) => ({
      count: agg.count(),
    })),
  ]);

  return {
    items,
    pagination: getPaginationMeta(countResult.count, page, limit),
  };
}
