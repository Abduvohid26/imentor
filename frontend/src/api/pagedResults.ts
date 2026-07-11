export type PagedResponse<T> = {
  count: number;
  page: number;
  page_size: number;
  results: T[];
};

/** API javobi massiv yoki paginated format bo'lishi mumkin. */
export function unwrapPagedResults<T>(data: T[] | PagedResponse<T> | null | undefined): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return Array.isArray(data.results) ? data.results : [];
}

export function appendPageParams(
  params: URLSearchParams,
  options?: { page?: number; pageSize?: number },
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (options?.page && options.page > 0) next.set('page', String(options.page));
  if (options?.pageSize && options.pageSize > 0) next.set('page_size', String(options.pageSize));
  return next;
}
