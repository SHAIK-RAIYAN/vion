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

const presignedUrlSchema = zod.object({
  fileName: zod.string().min(1, "File name is required"),
  contentType: zod.string().min(1, "Content type is required"),
  fileSize: zod.number().positive().optional(),
});

const remoteUrlSchema = zod.object({
  url: zod.string().url("Must be a valid video URL"),
  title: zod.string().min(1, "Title is required").max(200),
  description: zod.string().max(5000).optional(),
});

const finalizeUploadSchema = zod.object({
  storageKey: zod.string().optional(),
});

type CreateUploadInput = zod.infer<typeof createUploadSchema>;
type UpdateUploadInput = zod.infer<typeof updateUploadSchema>;
type AddVideoResolutionInput = zod.infer<typeof addVideoResolutionSchema>;
type PresignedUrlInput = zod.infer<typeof presignedUrlSchema>;
type RemoteUrlInput = zod.infer<typeof remoteUrlSchema>;

export {
  createUploadSchema,
  updateUploadSchema,
  addVideoResolutionSchema,
  presignedUrlSchema,
  remoteUrlSchema,
  finalizeUploadSchema,
  paginationSchema,
};
export type {
  CreateUploadInput,
  UpdateUploadInput,
  AddVideoResolutionInput,
  PresignedUrlInput,
  RemoteUrlInput,
};

