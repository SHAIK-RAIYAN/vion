import zod from "zod";
import { paginationSchema } from "../../utils/pagination";
import { MAX_UPLOAD_SIZE_BYTES } from "../../config/config";

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime", // .mov
  "video/x-msvideo", // .avi
  "video/x-matroska", // .mkv
  "video/mpeg",
] as const;

const visibilityEnum = zod.enum(["PUBLIC", "PRIVATE", "UNLISTED"]);
const processingStatusEnum = zod.enum([
  "PENDING",
  "UPLOADING",
  "TRANSCODING",
  "COMPLETED",
  "FAILED",
]);

const createUploadSchema = zod.object({
  title: zod.string().min(1, "Title is required").max(200, "Title cannot exceed 200 characters"),
  description: zod.string().max(5000, "Description cannot exceed 5000 characters").optional(),
  visibility: visibilityEnum.default("PRIVATE"),
  fileName: zod.string().min(1, "Filename is required").max(255).optional(),
  contentType: zod
    .string()
    .refine((val) => val.startsWith("video/"), {
      message: "Media type must be a valid video format (e.g., video/mp4, video/webm)",
    })
    .optional(),
  fileSize: zod
    .number()
    .positive("File size must be greater than 0")
    .max(MAX_UPLOAD_SIZE_BYTES, `File size exceeds the limit of ${Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))} MB`)
    .optional(),
  thumbnailUrl: zod.string().url().optional().or(zod.literal("")),
  category: zod.string().max(100).optional(),
  mood: zod.string().max(100).optional(),
  visualStyle: zod.string().max(100).optional(),
  colorTone: zod.string().max(100).optional(),
  environment: zod.string().max(100).optional(),
  tags: zod.string().max(500).optional(),
});

const presignedUrlSchema = zod.object({
  uploadId: zod.string().uuid("Invalid upload ID").optional(),
  fileName: zod.string().min(1, "File name is required").max(255),
  contentType: zod
    .string()
    .min(1, "Content type is required")
    .refine((val) => val.startsWith("video/"), {
      message: "Content type must be a video format (e.g., video/mp4, video/webm)",
    }),
  fileSize: zod
    .number()
    .positive("File size must be greater than 0")
    .max(MAX_UPLOAD_SIZE_BYTES, `File size exceeds maximum permitted limit`)
    .optional(),
});

const remoteUrlSchema = zod.object({
  url: zod.string().url("Must be a valid URL"),
  title: zod.string().min(1, "Title is required").max(200),
  description: zod.string().max(5000).optional(),
  visibility: visibilityEnum.default("PRIVATE"),
});

const updateUploadSchema = zod.object({
  title: zod.string().min(1).max(200).optional(),
  description: zod.string().max(5000).optional(),
  thumbnailUrl: zod.string().url().optional().or(zod.literal("")),
  visibility: visibilityEnum.optional(),
  category: zod.string().max(100).optional().nullable(),
  mood: zod.string().max(100).optional().nullable(),
  visualStyle: zod.string().max(100).optional().nullable(),
  colorTone: zod.string().max(100).optional().nullable(),
  environment: zod.string().max(100).optional().nullable(),
  tags: zod.string().max(500).optional().nullable(),
});

const finalizeUploadSchema = zod.object({
  storageKey: zod.string().optional(),
  resolution: zod.string().max(50).optional(),
  width: zod.number().int().positive().optional(),
  height: zod.number().int().positive().optional(),
  duration: zod.number().positive().optional(),
});

const addVideoResolutionSchema = zod.object({
  resolution: zod.string().min(1, "Resolution is required"),
  url: zod.string().url("Must be a valid video stream URL"),
});

type CreateUploadInput = zod.infer<typeof createUploadSchema>;
type UpdateUploadInput = zod.infer<typeof updateUploadSchema>;
type AddVideoResolutionInput = zod.infer<typeof addVideoResolutionSchema>;
type PresignedUrlInput = zod.infer<typeof presignedUrlSchema>;
type RemoteUrlInput = zod.infer<typeof remoteUrlSchema>;
type FinalizeUploadInput = zod.infer<typeof finalizeUploadSchema>;

export {
  createUploadSchema,
  updateUploadSchema,
  addVideoResolutionSchema,
  presignedUrlSchema,
  remoteUrlSchema,
  finalizeUploadSchema,
  paginationSchema,
  visibilityEnum,
  processingStatusEnum,
};
export type {
  CreateUploadInput,
  UpdateUploadInput,
  AddVideoResolutionInput,
  PresignedUrlInput,
  RemoteUrlInput,
  FinalizeUploadInput,
};
