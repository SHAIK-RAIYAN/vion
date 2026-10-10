import zod from "zod";
import { paginationSchema } from "../../utils/pagination";

const channelIdParamSchema = zod.object({
  channelId: zod.string().uuid("Invalid channel ID"),
});

export { channelIdParamSchema, paginationSchema };
