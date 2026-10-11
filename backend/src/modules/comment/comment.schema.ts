import zod from "zod";
import { paginationSchema } from "../../utils/pagination";

const createCommentSchema = zod.object({
  content: zod
    .string()
    .trim()
    .min(1, "Comment content cannot be empty")
    .max(2000, "Comment cannot exceed 2000 characters"),
});

const updateCommentSchema = zod.object({
  content: zod
    .string()
    .trim()
    .min(1, "Comment content cannot be empty")
    .max(2000, "Comment cannot exceed 2000 characters"),
});

type CreateCommentInput = zod.infer<typeof createCommentSchema>;
type UpdateCommentInput = zod.infer<typeof updateCommentSchema>;

export { createCommentSchema, updateCommentSchema, paginationSchema };
export type { CreateCommentInput, UpdateCommentInput };
