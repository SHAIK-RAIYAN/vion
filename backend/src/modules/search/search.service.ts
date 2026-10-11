import { db } from "../../prisma/db";
import { getPaginationMeta, type Pagination } from "../../utils/pagination";

const { Upload, Channel } = db.orm.public;

export async function searchContent(query: string, pagination: Pagination) {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;
  const normalizedQuery = (query || "").trim().toLowerCase();

  if (!normalizedQuery) {
    return {
      videos: [],
      channels: [],
      pagination: getPaginationMeta(0, page, limit),
    };
  }

  // Fetch candidate public videos
  const [allVideos, channels] = await Promise.all([
    Upload.where({ isDeleted: false, visibility: "PUBLIC" })
      .include("channel", (c) =>
        c.select("id", "handle", "channelName", "profilePictureUrl"),
      )
      .include("videos", (v) => v.select("id", "resolution", "url"))
      .orderBy((u) => u.createdAt.desc())
      .limit(100)
      .all(),
    Channel.limit(20).all(),
  ]);

  const matchedVideos = allVideos.filter(
    (v) =>
      v.title.toLowerCase().includes(normalizedQuery) ||
      (v.description && v.description.toLowerCase().includes(normalizedQuery)),
  );

  const matchedChannels = channels.filter(
    (c) =>
      c.channelName.toLowerCase().includes(normalizedQuery) ||
      c.handle.toLowerCase().includes(normalizedQuery),
  );

  const paginatedVideos = matchedVideos.slice(offset, offset + limit);

  return {
    videos: paginatedVideos,
    channels: matchedChannels,
    items: paginatedVideos,
    pagination: getPaginationMeta(matchedVideos.length, page, limit),
  };
}

export async function getSuggestions(query: string) {
  const normalizedQuery = (query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const videos = await Upload.where({ isDeleted: false, visibility: "PUBLIC" })
    .select("title")
    .limit(50)
    .all();

  const suggestions = videos
    .map((v) => v.title)
    .filter((title) => title.toLowerCase().includes(normalizedQuery))
    .slice(0, 10);

  return suggestions;
}
