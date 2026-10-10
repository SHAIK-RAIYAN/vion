import { db } from "../../prisma/db";
import { AppError } from "../../utils/AppError";
import { getPaginationMeta, type Pagination } from "../../utils/pagination";
import {
  createCommentSchema,
  updateCommentSchema,
  type CreateCommentInput,
  type UpdateCommentInput,
} from "./comment.schema";

const { Comment, Upload } = db.orm.public;

export async function createComment(
  uploadId: string,
  userId: string,
  input: CreateCommentInput,
) {
  const data = createCommentSchema.parse(input);

  const upload = await Upload.where({ id: uploadId, isDeleted: false }).first();
  if (!upload) {
    throw new AppError("Video not found.", 404);
  }

  const comment = await Comment.create({
    uploadId,
    userId,
    content: data.content,
  });

  return comment;
}

export async function getCommentsByUpload(
  uploadId: string,
  pagination: Pagination,
) {
  const upload = await Upload.where({ id: uploadId, isDeleted: false }).first();
  if (!upload) {
    throw new AppError("Video not found.", 404);
  }

  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const [items, countResult] = await Promise.all([
    Comment.where({ uploadId })
      .include("user", (u) =>
        u
          .select("id", "firstName", "lastName")
          .include("channel", (c) =>
            c.select("id", "handle", "channelName", "profilePictureUrl"),
          ),
      )
      .orderBy((c) => c.createdAt.desc())
      .limit(limit)
      .offset(offset)
      .all(),
    Comment.where({ uploadId }).aggregate((agg) => ({
      count: agg.count(),
    })),
  ]);

  return {
    items,
    pagination: getPaginationMeta(countResult.count, page, limit),
  };
}

export async function updateComment(
  commentId: string,
  userId: string,
  input: UpdateCommentInput,
) {
  const data = updateCommentSchema.parse(input);

  const comment = await Comment.first({ id: commentId });
  if (!comment) {
    throw new AppError("Comment not found.", 404);
  }

  if (comment.userId !== userId) {
    throw new AppError("You can only edit your own comment.", 403);
  }

  const updated = await Comment.where({ id: commentId }).update({
    content: data.content,
  });

  return updated;
}

export async function deleteComment(commentId: string, userId: string) {
  const comment = await Comment.where({ id: commentId })
    .include("upload", (u) =>
      u.include("channel", (c) => c.select("id", "userId")),
    )
    .first();

  if (!comment) {
    throw new AppError("Comment not found.", 404);
  }

  const isAuthor = comment.userId === userId;
  const isVideoOwner = comment.upload.channel.userId === userId;

  if (!isAuthor && !isVideoOwner) {
    throw new AppError(
      "You do not have permission to delete this comment.",
      403,
    );
  }

  await Comment.where({ id: commentId }).delete();

  return { message: "Comment deleted successfully" };
}
