import { z } from 'zod';
import { LOCALES } from '../domain/enums';

/** Decimal values travel as strings; numbers are accepted from forms and normalised. */
export const decimalString = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), { message: 'validation.decimal' });

export const positiveDecimal = decimalString.refine((v) => Number(v) > 0, { message: 'validation.positive' });
export const nonNegativeDecimal = decimalString.refine((v) => Number(v) >= 0, { message: 'validation.nonNegative' });

export const uuid = z.string().uuid({ message: 'validation.uuid' });
export const localeSchema = z.enum(LOCALES);

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().trim().max(200).optional(),
  sort: z.string().max(50).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Shape of every API error body. `code` is a stable i18n key (errors.<code>). */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}
