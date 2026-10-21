import { PaginationQuery } from '@stockiteasy/shared';

export function pageArgs(q: Pick<PaginationQuery, 'page' | 'pageSize'>) {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export function paginated<T>(items: T[], total: number, q: Pick<PaginationQuery, 'page' | 'pageSize'>) {
  return { items, total, page: q.page, pageSize: q.pageSize };
}
