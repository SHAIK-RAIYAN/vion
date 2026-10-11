import { db } from "../../prisma/db";
import { AppError } from "../../utils/AppError";
import { getPaginationMeta, type Pagination } from "../../utils/pagination";
import {
  setInteractionSchema,
  type SetInteractionInput,
} from "./interaction.schema";

const { Interaction, Upload } = db.orm.public;

export async function setInteraction(
  uploadId: string,
  userId: string,
  input: SetInteractionInput,
) {
  const data = setInteractionSchema.parse(input);

  const upload = await Upload.where({ id: uploadId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();
  if (!upload) {
    throw new AppError("Video not found.", 404, "VIDEO_NOT_FOUND");
  }

  // Authorization gate: Private videos cannot be interacted with by unauthorized users
  if (upload.visibility === "PRIVATE" && upload.channel.userId !== userId) {
    throw new AppError("This video is private.", 403, "PRIVATE_VIDEO");
  }

  const existing = await Interaction.where({ uploadId, userId }).first();

  if (existing) {
    if (existing.interactionType === data.type) {
      // Idempotent: repeated PUT preserves the desired reaction
      return { interaction: existing, status: "EXISTING" };
    } else {
      const updated = await Interaction.where({ id: existing.id }).update({
        interactionType: data.type,
      });
      return { interaction: updated, status: "UPDATED" };
    }
  }

  try {
    const created = await Interaction.create({
      uploadId,
      userId,
      interactionType: data.type,
    });
    return { interaction: created, status: "CREATED" };
  } catch (err: any) {
    // Handle concurrent unique constraint violation on @@unique([userId, uploadId])
    const raceRecord = await Interaction.where({ uploadId, userId }).first();
    if (raceRecord) {
      if (raceRecord.interactionType !== data.type) {
        const updated = await Interaction.where({ id: raceRecord.id }).update({
          interactionType: data.type,
        });
        return { interaction: updated, status: "UPDATED" };
      }
      return { interaction: raceRecord, status: "EXISTING" };
    }
    throw err;
  }
}

export async function removeInteraction(uploadId: string, userId: string) {
  const upload = await Upload.where({ id: uploadId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();
  if (!upload) {
    throw new AppError("Video not found.", 404, "VIDEO_NOT_FOUND");
  }

  if (upload.visibility === "PRIVATE" && upload.channel.userId !== userId) {
    throw new AppError("This video is private.", 403, "PRIVATE_VIDEO");
  }

  const existing = await Interaction.where({ uploadId, userId }).first();
  if (!existing) {
    // Idempotent removal: safe return when already removed
    return { message: "Interaction already removed", success: true };
  }

  await Interaction.where({ id: existing.id }).delete();
  return { message: "Interaction removed successfully", success: true };
}

export async function getInteractionCounts(
  uploadId: string,
  currentUserId?: string,
) {
  const upload = await Upload.where({ id: uploadId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();
  if (!upload) {
    throw new AppError("Video not found.", 404, "VIDEO_NOT_FOUND");
  }

  if (upload.visibility === "PRIVATE") {
    if (!currentUserId || upload.channel.userId !== currentUserId) {
      throw new AppError("This video is private.", 403, "PRIVATE_VIDEO");
    }
  }

  const [likeAgg, dislikeAgg, userInteraction] = await Promise.all([
    Interaction.where({ uploadId, interactionType: "LIKE" }).aggregate((agg) => ({
      count: agg.count(),
    })),
    Interaction.where({ uploadId, interactionType: "DISLIKE" }).aggregate((agg) => ({
      count: agg.count(),
    })),
    currentUserId
      ? Interaction.where({ uploadId, userId: currentUserId }).first()
      : Promise.resolve(null),
  ]);

  const liked = userInteraction?.interactionType === "LIKE";
  const disliked = userInteraction?.interactionType === "DISLIKE";

  return {
    videoId: uploadId,
    likes: likeAgg.count,
    dislikes: dislikeAgg.count,
    liked,
    disliked,
    userInteraction: userInteraction ? userInteraction.interactionType : null,
  };
}

export async function getMyLikedVideos(userId: string, pagination: Pagination) {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const [items, countResult] = await Promise.all([
    Interaction.where({ userId, interactionType: "LIKE" })
      .include("upload", (u) =>
        u
          .where({ isDeleted: false })
          .select("id", "title", "description", "thumbnailUrl", "viewCount", "createdAt")
          .include("channel", (c) =>
            c.select("id", "handle", "channelName", "profilePictureUrl"),
          ),
      )
      .orderBy([(i) => i.createdAt.desc(), (i) => i.id.desc()])
      .limit(limit)
      .offset(offset)
      .all(),
    Interaction.where({ userId, interactionType: "LIKE" }).aggregate((agg) => ({
      count: agg.count(),
    })),
  ]);

  return {
    items,
    pagination: getPaginationMeta(countResult.count, page, limit),
  };
}
