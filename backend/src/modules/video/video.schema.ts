import zod from "zod";
import { paginationSchema } from "../../utils/pagination";

export const publishVideoSchema = zod.object({
  uploadId: zod.string().min(1, "uploadId is required"),
  title: zod.string().min(1).max(200).optional(),
  description: zod.string().max(5000).optional(),
  visibility: zod.enum(["PUBLIC", "PRIVATE", "UNLISTED"]).default("PUBLIC"),
  thumbnailUrl: zod.string().url().optional().or(zod.literal("")),
});

export const updateVideoSchema = zod.object({
  title: zod.string().min(1).max(200).optional(),
  description: zod.string().max(5000).optional(),
  visibility: zod.enum(["PUBLIC", "PRIVATE", "UNLISTED"]).optional(),
  thumbnailUrl: zod.string().url().optional().or(zod.literal("")),
});

export const thumbnailUploadSchema = zod.object({
  fileName: zod.string().min(1, "File name is required"),
  contentType: zod.string().min(1, "Content type is required"),
});

export const setActiveThumbnailSchema = zod.object({
  thumbnailUrl: zod.string().url("Must be a valid URL"),
});

export type PublishVideoInput = zod.infer<typeof publishVideoSchema>;
export type UpdateVideoInput = zod.infer<typeof updateVideoSchema>;
export { paginationSchema };
