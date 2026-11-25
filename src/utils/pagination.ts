import { z } from 'zod';

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationQuery>;

export function toSkip({ page, limit }: Pagination) {
  return { skip: (page - 1) * limit, limit };
}

export function paginated<T>(data: T[], total: number, { page, limit }: Pagination) {
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 } };
}
