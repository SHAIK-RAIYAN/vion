import zod from "zod";
import { paginationSchema } from "../../utils/pagination";

const recordHistorySchema = zod
  .object({
    uploadId: zod.string().min(1, "Invalid upload ID").optional(),
    videoId: zod.string().min(1, "Invalid video ID").optional(),
    progressTimeStamp: zod.union([zod.number(), zod.string()]).optional(),
    progressTimestamp: zod.union([zod.number(), zod.string()]).optional(),
    positionSeconds: zod.union([zod.number(), zod.string()]).optional(),
  })
  .transform((data) => {
    const rawVal =
      data.progressTimeStamp ?? data.progressTimestamp ?? data.positionSeconds ?? 0;
    const progress = Math.max(0, Math.floor(Number(rawVal) || 0));
    return {
      uploadId: data.uploadId || data.videoId || "",
      progressTimeStamp: progress,
    };
  });

const updateProgressSchema = zod
  .object({
    progressTimeStamp: zod.union([zod.number(), zod.string()]).optional(),
    progressTimestamp: zod.union([zod.number(), zod.string()]).optional(),
    positionSeconds: zod.union([zod.number(), zod.string()]).optional(),
  })
  .transform((data) => {
    const rawVal =
      data.progressTimeStamp ?? data.progressTimestamp ?? data.positionSeconds ?? 0;
    const progress = Math.max(0, Math.floor(Number(rawVal) || 0));
    return {
      progressTimeStamp: progress,
    };
  });

type RecordHistoryInput = zod.infer<typeof recordHistorySchema>;
type UpdateProgressInput = zod.infer<typeof updateProgressSchema>;

export { recordHistorySchema, updateProgressSchema, paginationSchema };
export type { RecordHistoryInput, UpdateProgressInput };

