import zod from "zod";

const paginationSchema = zod.object({
  page: zod.coerce.number().int().min(1).default(1),
  limit: zod.coerce.number().int().min(1).max(100).default(20),
});

type Pagination = zod.infer<typeof paginationSchema>;

export function getPaginationMeta(total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

export { paginationSchema };
export type { Pagination };
