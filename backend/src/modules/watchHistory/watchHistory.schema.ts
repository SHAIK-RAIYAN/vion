import zod from "zod";
import { paginationSchema } from "../../utils/pagination";

const recordHistorySchema = zod.object({
  uploadId: zod.string().uuid("Invalid upload ID"),
  progressTimeStamp: zod
    .number()
    .int("Progress must be an integer (seconds)")
    .min(0, "Progress cannot be negative")
    .default(0),
});

type RecordHistoryInput = zod.infer<typeof recordHistorySchema>;

export { recordHistorySchema, paginationSchema };
export type { RecordHistoryInput };
