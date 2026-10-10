import zod from "zod";
import { paginationSchema } from "../../utils/pagination";

const setInteractionSchema = zod.object({
  type: zod.enum(["LIKE", "DISLIKE"], {
    message: "Type must be either LIKE or DISLIKE",
  }),
});

type SetInteractionInput = zod.infer<typeof setInteractionSchema>;

export { setInteractionSchema, paginationSchema };
export type { SetInteractionInput };
