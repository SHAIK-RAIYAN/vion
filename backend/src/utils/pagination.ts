import zod from "zod";

const paginationSchema = zod.object({
  page: zod.coerce.number().int().min(1).default(1),
  limit: zod.coerce.number().int().min(1).max(100).default(20),
});

type Pagination = zod.infer<typeof paginationSchema>;

export { paginationSchema };
export type { Pagination };
