import { httpJson } from '../api/httpClient';
import { unwrapPagedResults, type PagedResponse } from '../api/pagedResults';
import type {
  CatalogItemDetail,
  CatalogItemSummary,
  CatalogKind,
  CatalogSubjectRow,
} from './contentCatalogApi';

export type PublicCatalogItemSummary = CatalogItemSummary & {
  document_id?: string;
  verification_code?: string;
};

export type PublicCatalogItemDetail = CatalogItemDetail & {
  document_id?: string;
  verification_code?: string;
  view_only?: boolean;
};

function apiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.VITE_API_BASE_URL?.trim() || '/api';
}

export async function fetchPublicCatalogSubjects(): Promise<CatalogSubjectRow[]> {
  const rows = await httpJson<CatalogSubjectRow[]>(`${apiBaseUrl()}/v1/public/content-catalog/subjects/`, {
    timeoutMs: 20000,
  });
  return Array.isArray(rows) ? rows : [];
}

export async function fetchPublicCatalogItems(params: {
  kind?: CatalogKind | '';
  subjectCode?: string;
  departmentCode?: string;
  q?: string;
  author?: string;
  sort?: 'subject' | 'topic' | 'newest';
  page?: number;
  pageSize?: number;
}): Promise<PublicCatalogItemSummary[]> {
  const data = await fetchPublicCatalogPage(params);
  return unwrapPagedResults(data);
}

async function fetchPublicCatalogPage(params: {
  kind?: CatalogKind | '';
  subjectCode?: string;
  departmentCode?: string;
  q?: string;
  author?: string;
  sort?: 'subject' | 'topic' | 'newest';
  page?: number;
  pageSize?: number;
}): Promise<PublicCatalogItemSummary[] | PagedResponse<PublicCatalogItemSummary>> {
  const query = new URLSearchParams();
  if (params.kind) query.set('kind', params.kind);
  if (params.subjectCode) query.set('subject_code', params.subjectCode);
  if (params.departmentCode) query.set('department_code', params.departmentCode);
  if (params.q?.trim()) query.set('q', params.q.trim());
  if (params.author?.trim()) query.set('author', params.author.trim());
  if (params.sort) query.set('sort', params.sort);
  if (params.page && params.page > 0) query.set('page', String(params.page));
  if (params.pageSize && params.pageSize > 0) query.set('page_size', String(params.pageSize));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return httpJson<PublicCatalogItemSummary[] | PagedResponse<PublicCatalogItemSummary>>(
    `${apiBaseUrl()}/v1/public/content-catalog/${suffix}`,
    { timeoutMs: 30000 },
  );
}

/** Server sahifalab beradi (default 50) — katalog to'liq ko'rinishi uchun
 *  barcha sahifalarni yig'amiz. Aks holda talaba faqat birinchi 50 tasini
 *  ko'rardi va "materialim yo'q" degan taassurot paydo bo'lardi. */
export async function fetchAllPublicCatalogItems(
  params: Parameters<typeof fetchPublicCatalogItems>[0] = {},
  { maxPages = 20, pageSize = 200 }: { maxPages?: number; pageSize?: number } = {},
): Promise<PublicCatalogItemSummary[]> {
  const out: PublicCatalogItemSummary[] = [];
  const seen = new Set<number>();
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await fetchPublicCatalogPage({ ...params, page, pageSize });
    const rows = unwrapPagedResults(data);
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
    // Massiv qaytsa — sahifalash yo'q, bitta so'rov yetarli.
    if (Array.isArray(data)) break;
    const total = Number(data?.count ?? 0);
    if (rows.length < pageSize || out.length >= total) break;
  }
  return out;
}

export async function fetchPublicCatalogItemDetail(id: number): Promise<PublicCatalogItemDetail | null> {
  try {
    return await httpJson<PublicCatalogItemDetail>(`${apiBaseUrl()}/v1/public/content-catalog/${id}/`, {
      timeoutMs: 30000,
    });
  } catch {
    return null;
  }
}
