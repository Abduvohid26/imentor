import { httpJson } from '../api/httpClient';
import { getBackendAccessToken } from './backendAuth';

/** OnlineTest'dagi Kafedra -> Yo'nalish -> Guruh daraxti (faqat o'qish). */
export type CatalogGroup = { id: number; name: string; level: string; student_count: number };
export type CatalogDirection = { id: number; name: string; groups: CatalogGroup[] };
export type CatalogKafedra = { id: number; name: string; code: string | null; directions: CatalogDirection[] };
export type AcademicCatalog = {
  kafedralar: CatalogKafedra[];
  unassigned_directions: CatalogDirection[];
};

function apiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.VITE_API_BASE_URL?.trim() || '/api';
}

let cached: AcademicCatalog | null = null;
let cachedAt = 0;
const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 daqiqa — backend bilan bir xil TTL

/** Backend `fetch_academic_catalog()` ni proksi qiladi — OnlineTest kaliti frontendga chiqmaydi. */
export async function fetchAcademicCatalog(opts?: { force?: boolean }): Promise<AcademicCatalog> {
  if (!opts?.force && cached && Date.now() - cachedAt < CLIENT_CACHE_TTL_MS) {
    return cached;
  }
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  const data = await httpJson<AcademicCatalog>(`${apiBaseUrl()}/v1/academic-catalog/`, {
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: 20000,
  });
  cached = data;
  cachedAt = Date.now();
  return data;
}

/** Ro'yxatdan o'tish formasi uchun ochiq kafedra ro'yxati (token talab qilmaydi). */
export type PublicKafedra = { id: number | null; name: string; code: string | null; directions: string[] };

let cachedPublic: PublicKafedra[] | null = null;
let cachedPublicAt = 0;

export async function fetchPublicKafedralar(): Promise<PublicKafedra[]> {
  if (cachedPublic && Date.now() - cachedPublicAt < CLIENT_CACHE_TTL_MS) return cachedPublic;
  const rows = await httpJson<PublicKafedra[]>(`${apiBaseUrl()}/v1/public/kafedralar/`, { timeoutMs: 20000 });
  cachedPublic = rows;
  cachedPublicAt = Date.now();
  return rows;
}
