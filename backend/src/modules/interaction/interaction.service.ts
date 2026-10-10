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

  const upload = await Upload.where({ id: uploadId, isDeleted: false }).first();
  if (!upload) {
    throw new AppError("Video not found.", 404);
  }

  const existing = await Interaction.where({ uploadId, userId }).first();

  if (existing) {
    if (existing.interactionType === data.type) {
      await Interaction.where({ id: existing.id }).delete();
      return { interaction: null, status: "REMOVED" };
    } else {
      const updated = await Interaction.where({ id: existing.id }).update({
        interactionType: data.type,
      });
      return { interaction: updated, status: "UPDATED" };
    }
  }

  const created = await Interaction.create({
    uploadId,
    userId,
    interactionType: data.type,
  });

  return { interaction: created, status: "CREATED" };
}

export async function removeInteraction(uploadId: string, userId: string) {
  const existing = await Interaction.where({ uploadId, userId }).first();
  if (!existing) {
    throw new AppError("No interaction found for this video.", 404);
  }

  await Interaction.where({ id: existing.id }).delete();
  return { message: "Interaction removed successfully" };
}

export async function getInteractionCounts(
  uploadId: string,
  currentUserId?: string,
) {
  const upload = await Upload.where({ id: uploadId, isDeleted: false }).first();
  if (!upload) {
    throw new AppError("Video not found.", 404);
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

  return {
    likes: likeAgg.count,
    dislikes: dislikeAgg.count,
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
      .orderBy((i) => i.createdAt.desc())
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
