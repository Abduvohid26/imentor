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
  q?: string;
  author?: string;
  sort?: 'subject' | 'topic' | 'newest';
}): Promise<PublicCatalogItemSummary[]> {
  const query = new URLSearchParams();
  if (params.kind) query.set('kind', params.kind);
  if (params.subjectCode) query.set('subject_code', params.subjectCode);
  if (params.q?.trim()) query.set('q', params.q.trim());
  if (params.author?.trim()) query.set('author', params.author.trim());
  if (params.sort) query.set('sort', params.sort);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await httpJson<PublicCatalogItemSummary[] | PagedResponse<PublicCatalogItemSummary>>(
    `${apiBaseUrl()}/v1/public/content-catalog/${suffix}`,
    { timeoutMs: 30000 },
  );
  return unwrapPagedResults(data);
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
