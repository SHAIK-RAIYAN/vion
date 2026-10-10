import zod from "zod";
import { paginationSchema } from "../../utils/pagination";

const visibilityEnum = zod.enum(["PUBLIC", "PRIVATE", "UNLISTED"]);
const processingStatusEnum = zod.enum([
  "PENDING",
  "UPLOADING",
  "TRANSCODING",
  "COMPLETED",
  "FAILED",
]);

const createUploadSchema = zod.object({
  title: zod.string().min(1, "Title is required").max(200, "Title is too long"),
  description: zod.string().max(5000).optional(),
  thumbnailUrl: zod.string().url().optional().or(zod.literal("")),
  hlsManifestUrl: zod.string().url().optional().or(zod.literal("")),
  visibility: visibilityEnum.default("PRIVATE"),
  processingStatus: processingStatusEnum.default("PENDING"),
});

const updateUploadSchema = zod.object({
  title: zod.string().min(1).max(200).optional(),
  description: zod.string().max(5000).optional(),
  thumbnailUrl: zod.string().url().optional().or(zod.literal("")),
  hlsManifestUrl: zod.string().url().optional().or(zod.literal("")),
  visibility: visibilityEnum.optional(),
  processingStatus: processingStatusEnum.optional(),
});

const addVideoResolutionSchema = zod.object({
  resolution: zod.string().min(1, "Resolution is required"),
  url: zod.string().url("Must be a valid video stream URL"),
});

type CreateUploadInput = zod.infer<typeof createUploadSchema>;
type UpdateUploadInput = zod.infer<typeof updateUploadSchema>;
type AddVideoResolutionInput = zod.infer<typeof addVideoResolutionSchema>;

export {
  createUploadSchema,
  updateUploadSchema,
  addVideoResolutionSchema,
  paginationSchema,
};
export type {
  CreateUploadInput,
  UpdateUploadInput,
  AddVideoResolutionInput,
};
