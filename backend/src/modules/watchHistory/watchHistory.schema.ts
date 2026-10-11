import zod from "zod";
import { paginationSchema } from "../../utils/pagination";

const recordHistorySchema = zod.object({
  uploadId: zod.string().min(1, "Invalid upload ID"),
  progressTimeStamp: zod
    .number()
    .int("Progress must be an integer (seconds)")
    .min(0, "Progress cannot be negative")
    .default(0),
});

const updateProgressSchema = zod.object({
  progressTimeStamp: zod
    .number()
    .int("Progress must be an integer (seconds)")
    .min(0, "Progress cannot be negative")
    .default(0),
});

type RecordHistoryInput = zod.infer<typeof recordHistorySchema>;
type UpdateProgressInput = zod.infer<typeof updateProgressSchema>;

export { recordHistorySchema, updateProgressSchema, paginationSchema };
export type { RecordHistoryInput, UpdateProgressInput };

