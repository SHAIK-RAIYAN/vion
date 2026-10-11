import { db } from "../../prisma/db";
import { getPaginationMeta, type Pagination } from "../../utils/pagination";

const { Upload, Channel } = db.orm.public;

export async function searchContent(query: string, pagination: Pagination) {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;
  const sanitizedQuery = (query || "").trim();

  if (!sanitizedQuery) {
    return {
      videos: [],
      channels: [],
      items: [],
      pagination: getPaginationMeta(0, page, limit),
    };
  }

  // Pure database-driven queries avoiding in-memory array filtering and N+1 queries
  const [videos, channels, countResult] = await Promise.all([
    Upload.where({ isDeleted: false, visibility: "PUBLIC", processingStatus: "COMPLETED" })
      .where((u) => u.title.ilike(`%${sanitizedQuery}%`))
      .include("channel", (c) =>
        c.select("id", "handle", "channelName", "profilePictureUrl"),
      )
      .include("videos", (v) => v.select("id", "resolution", "url"))
      .orderBy([(u) => u.createdAt.desc(), (u) => u.id.desc()])
      .limit(limit)
      .offset(offset)
      .all(),
    Channel.where((c) => c.channelName.ilike(`%${sanitizedQuery}%`))
      .limit(limit)
      .all(),
    Upload.where({ isDeleted: false, visibility: "PUBLIC", processingStatus: "COMPLETED" })
      .where((u) => u.title.ilike(`%${sanitizedQuery}%`))
      .aggregate((agg) => ({
        count: agg.count(),
      })),
  ]);

  return {
    videos,
    channels,
    items: videos,
    pagination: getPaginationMeta(countResult.count, page, limit),
  };
}

export async function getSuggestions(query: string) {
  const sanitizedQuery = (query || "").trim();
  if (!sanitizedQuery) {
    return [];
  }

  const videos = await Upload.where({ isDeleted: false, visibility: "PUBLIC", processingStatus: "COMPLETED" })
    .where((u) => u.title.ilike(`%${sanitizedQuery}%`))
    .select("title")
    .limit(10)
    .all();

  return Array.from(new Set(videos.map((v) => v.title)));
}
