import { httpJson } from '../api/httpClient';
import { unwrapPagedResults, type PagedResponse } from '../api/pagedResults';
import type { AppLanguage } from '../i18n/language';
import { translate } from '../i18n/translations';
import { getBackendAccessToken } from './backendAuth';
import type { CaseStudySession, TestSession } from '../services/aiService';

export type CatalogKind = 'case' | 'test';

export type CatalogItemSummary = {
  id: number;
  kind: CatalogKind;
  topic: string;
  topic_norm: string;
  subject_name: string;
  subject_code: string;
  author_display_name: string;
  created_at: string;
  question_count: number;
};

export type CatalogSubjectRow = {
  subject_code: string;
  subject_name: string;
  case_count: number;
  test_count: number;
  total_count: number;
};

export type CatalogItemDetail = CatalogItemSummary & {
  payload: CaseStudySession | TestSession;
};

function apiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.VITE_API_BASE_URL?.trim() || '/api';
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function fetchCatalogSubjects(): Promise<CatalogSubjectRow[]> {
  const token = await getBackendAccessToken();
  if (!token) return [];
  const rows = await httpJson<CatalogSubjectRow[]>(`${apiBaseUrl()}/v1/content-catalog/subjects/`, {
    headers: authHeaders(token),
    timeoutMs: 20000,
  });
  return Array.isArray(rows) ? rows : [];
}

export async function fetchCatalogItems(params: {
  kind?: CatalogKind | '';
  subjectCode?: string;
  q?: string;
  author?: string;
  sort?: 'subject' | 'topic' | 'newest';
}): Promise<CatalogItemSummary[]> {
  const token = await getBackendAccessToken();
  if (!token) return [];
  const query = new URLSearchParams();
  if (params.kind) query.set('kind', params.kind);
  if (params.subjectCode) query.set('subject_code', params.subjectCode);
  if (params.q?.trim()) query.set('q', params.q.trim());
  if (params.author?.trim()) query.set('author', params.author.trim());
  if (params.sort) query.set('sort', params.sort);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await httpJson<CatalogItemSummary[] | PagedResponse<CatalogItemSummary>>(
    `${apiBaseUrl()}/v1/content-catalog/${suffix}`,
    {
      headers: authHeaders(token),
      timeoutMs: 30000,
    },
  );
  return unwrapPagedResults(data);
}

export async function fetchCatalogItemDetail(id: number): Promise<CatalogItemDetail | null> {
  const token = await getBackendAccessToken();
  if (!token) return null;
  try {
    return await httpJson<CatalogItemDetail>(`${apiBaseUrl()}/v1/content-catalog/${id}/`, {
      headers: authHeaders(token),
      timeoutMs: 30000,
    });
  } catch {
    return null;
  }
}

// ——— Admin: cheklovsiz (1 soatlik e'lon kechikishisiz) ko'rish va o'chirish ———

export async function fetchAdminCatalogItems(params: {
  kind?: CatalogKind | '';
  subjectCode?: string;
  q?: string;
}): Promise<CatalogItemSummary[]> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  const query = new URLSearchParams();
  if (params.kind) query.set('kind', params.kind);
  if (params.subjectCode) query.set('subject_code', params.subjectCode);
  if (params.q?.trim()) query.set('q', params.q.trim());
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await httpJson<CatalogItemSummary[] | PagedResponse<CatalogItemSummary>>(
    `${apiBaseUrl()}/v1/admin/content-catalog/${suffix}`,
    {
      headers: authHeaders(token),
      timeoutMs: 30000,
    },
  );
  return unwrapPagedResults(data);
}

export async function fetchAdminCatalogItemDetail(id: number): Promise<CatalogItemDetail | null> {
  const token = await getBackendAccessToken();
  if (!token) return null;
  try {
    return await httpJson<CatalogItemDetail>(`${apiBaseUrl()}/v1/admin/content-catalog/${id}/`, {
      headers: authHeaders(token),
      timeoutMs: 30000,
    });
  } catch {
    return null;
  }
}

export async function deleteAdminCatalogItem(id: number): Promise<void> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  await httpJson<unknown>(`${apiBaseUrl()}/v1/admin/content-catalog/${id}/`, {
    method: 'DELETE',
    headers: authHeaders(token),
    timeoutMs: 20000,
  });
}

export function groupCatalogBySubject(
  items: CatalogItemSummary[],
  lang: AppLanguage = 'uz',
): Map<string, CatalogItemSummary[]> {
  const map = new Map<string, CatalogItemSummary[]>();
  const fallbackSubject = translate(lang, 'catalog.otherTopics');
  for (const item of items) {
    const key = item.subject_name?.trim() || fallbackSubject;
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  for (const [key, list] of map) {
    list.sort((a, b) => a.topic.localeCompare(b.topic, 'uz'));
    map.set(key, list);
  }
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'uz')));
}
