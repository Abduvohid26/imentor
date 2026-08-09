import { getCurrentLocalUser } from './localStaffAuth';
import { HttpError, httpJson } from '../api/httpClient';
import { getBackendAccessToken } from './backendAuth';
import { topicNormLookupKeys } from './syllabusTopicContext';
import type { SyllabusTopic } from '../services/aiService';
import type { SyllabusTopicContext } from './syllabusTopicContext';

export type PreparedContentKind = 'lecture' | 'presentation' | 'case' | 'test';

export type PreparedContentMeta = {
  authorDisplayName?: string;
  subjectName?: string;
  subjectCode?: string;
  variantLabel?: string;
  topicCode?: string;
  topicNorm?: string;
};

export type PreparedContentSummary = {
  id: string;
  topic: string;
  topicNorm?: string;
  createdAt: number;
  source: 'local' | 'cloud';
  /** Kim yaratgan — Baza ro'yxatida ko'rsatiladi. */
  author?: string;
};

const CLOUD_ID_PREFIX = 'cloud_';

function ownerKey(): string | null {
  const u = getCurrentLocalUser();
  if (!u) return null;
  return u.phoneDigits || u.uid || null;
}

export function normTopicKey(topic: string): string {
  return topic.trim().toLowerCase();
}

function normTopic(topic: string): string {
  return normTopicKey(topic);
}

function apiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.VITE_API_BASE_URL?.trim() || '/api';
}

async function requireAuthToken(): Promise<string> {
  const token = await getBackendAccessToken();
  if (!token) {
    throw new Error('Tizimga kiring — kontent FastAPI bazasiga saqlanadi.');
  }
  return token;
}

/** data:URL rasmlar JSON ni shishiradi — PPTXda allaqachon bor, bazaga yozilmaydi. */
function stripHeavyMediaFromPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const deck = payload as { slides?: unknown };
  if (!Array.isArray(deck.slides)) return payload;
  return {
    ...deck,
    slides: deck.slides.map((slide) => {
      if (!slide || typeof slide !== 'object') return slide;
      const s = slide as Record<string, unknown>;
      const imageUrl = typeof s.imageUrl === 'string' ? s.imageUrl : '';
      if (!imageUrl.startsWith('data:')) return slide;
      const { imageUrl: _drop, ...rest } = s;
      return rest;
    }),
  };
}

function cloudId(numericId: number | string): string {
  return `${CLOUD_ID_PREFIX}${numericId}`;
}

function parseCloudNumericId(id: string): string | null {
  if (id.startsWith(CLOUD_ID_PREFIX)) return id.slice(CLOUD_ID_PREFIX.length);
  if (/^\d+$/.test(id)) return id;
  return null;
}

type CloudRow = {
  id: number;
  topic: string;
  topic_norm?: string;
  payload?: unknown;
  created_at: string;
};

/** Saqlash — AI generatsiyasidan keyingi eng muhim qadam: bu yerda yiqilsa
 * o'qituvchining bir necha daqiqalik ishi yo'qoladi. Shuning uchun:
 *  - timeout uzun (payload katta, mobil internet sekin bo'lishi mumkin),
 *  - vaqtinchalik xatolarda (tarmoq, timeout, 5xx) qisqa kutib qayta uriniladi.
 * 4xx (validatsiya/autentifikatsiya) da qayta urinilmaydi — natija o'zgarmaydi. */
async function postWithRetry(url: string, token: string, body: unknown): Promise<void> {
  const delaysMs = [800, 2500];
  for (let attempt = 0; ; attempt += 1) {
    try {
      await httpJson(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
        timeoutMs: 60_000,
      });
      return;
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 0;
      const retriable = status === 0 || status === 429 || status >= 500;
      if (!retriable || attempt >= delaysMs.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
}

/** Asosiy saqlash — FastAPI `/v1/prepared-content/` (Postgres). localStorage ishlatilmaydi. */
export async function savePreparedContent(
  kind: PreparedContentKind,
  topic: string,
  payload: unknown,
  meta?: PreparedContentMeta,
): Promise<void> {
  const owner = ownerKey();
  if (!owner) {
    throw new Error('Tizimga kiring — kontent FastAPI bazasiga saqlanadi.');
  }
  const token = await requireAuthToken();
  const topicNorm = meta?.topicNorm?.trim() || normTopic(topic);
  const lightPayload = stripHeavyMediaFromPayload(payload);

  await postWithRetry(`${apiBaseUrl()}/v1/prepared-content/`, token, {
      owner_key: owner,
      kind,
      topic: topic.trim() || 'Nomsiz',
      topic_norm: topicNorm,
      author_display_name: meta?.authorDisplayName?.trim() || '',
      subject_name: meta?.subjectName?.trim() || '',
      subject_code: meta?.subjectCode?.trim() || '',
      variant_label: meta?.variantLabel?.trim() || '',
      topic_code: meta?.topicCode?.trim() || '',
      payload: lightPayload,
  });
}

/** @deprecated Faqat sync ro'yxatdan foydalaning — localStorage o'chirilgan. */
export function listPreparedForTopic(
  _kind: PreparedContentKind,
  _topic: SyllabusTopic | SyllabusTopicContext | string,
): PreparedContentSummary[] {
  return [];
}

/** @deprecated localStorage o'rniga `listAllPreparedForKindSynced` ishlating. */
export function listAllPreparedForKind(_kind: PreparedContentKind): PreparedContentSummary[] {
  return [];
}

/** FastAPI `/v1/prepared-content/mine/` — foydalanuvchi tarixi bazadan. */
export async function listAllPreparedForKindSynced(
  kind: PreparedContentKind,
): Promise<PreparedContentSummary[]> {
  try {
    const token = await getBackendAccessToken();
    if (!token) return [];
    const data = await httpJson<{
      results?: {
        id: number;
        topic: string;
        topic_norm?: string;
        author_display_name?: string;
        created_at: string;
      }[];
    }>(`${apiBaseUrl()}/v1/prepared-content/mine/?kind=${encodeURIComponent(kind)}&page_size=200`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return (data.results || [])
      .map((r) => ({
        id: cloudId(r.id),
        topic: r.topic,
        topicNorm: r.topic_norm || normTopic(r.topic),
        author: r.author_display_name || '',
        createdAt: new Date(r.created_at).getTime(),
        source: 'cloud' as const,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

/** Mavzu bo'yicha FastAPI tarix (mine + filter). */
export async function listPreparedForTopicSynced(
  kind: PreparedContentKind,
  topic: SyllabusTopic | SyllabusTopicContext | string,
): Promise<PreparedContentSummary[]> {
  const wanted = new Set(
    (typeof topic === 'string' ? [normTopic(topic)] : topicNormLookupKeys(topic)).map((k) =>
      k.toLowerCase(),
    ),
  );
  if (!wanted.size) return [];
  const all = await listAllPreparedForKindSynced(kind);
  return all.filter((r) => {
    const keys = [r.topicNorm || '', normTopic(r.topic)].map((k) => k.toLowerCase()).filter(Boolean);
    return keys.some((k) => wanted.has(k) || [...wanted].some((w) => k.includes(w) || w.includes(k)));
  });
}

/** @deprecated local id endi yo'q — `loadPreparedByIdSynced` ishlating. */
export function loadPreparedById<T>(_kind: PreparedContentKind, _id: string): T | null {
  return null;
}

/** FastAPI `/v1/prepared-content/{id}/` — to'liq payload. */
export async function loadPreparedByIdSynced<T>(
  kind: PreparedContentKind,
  id: string,
): Promise<T | null> {
  const numericId = parseCloudNumericId(id);
  if (!numericId) return null;
  try {
    const token = await getBackendAccessToken();
    if (!token) return null;
    const data = await httpJson<{ payload?: T; kind?: string }>(
      `${apiBaseUrl()}/v1/prepared-content/${numericId}/`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (data.kind && data.kind !== kind) return null;
    return data.payload ?? null;
  } catch {
    return null;
  }
}

export async function deletePreparedContent(kind: PreparedContentKind, id: string): Promise<void> {
  const numericId = parseCloudNumericId(id);
  if (!numericId) return;
  const token = await requireAuthToken();
  await httpJson(`${apiBaseUrl()}/v1/prepared-content/${numericId}/`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  void kind;
}

/** FastAPI latest by topic_norm — birinchi mos kelgan kalit. */
export async function loadLatestPreparedContent<T>(
  kind: PreparedContentKind,
  topic: SyllabusTopic | SyllabusTopicContext | string,
): Promise<T | null> {
  const lookupKeys = (
    typeof topic === 'string' ? [normTopic(topic)] : topicNormLookupKeys(topic)
  )
    .map((k) => k.toLowerCase())
    .filter(Boolean);
  if (!lookupKeys.length) return null;

  try {
    const token = await getBackendAccessToken();
    if (!token) return null;
    for (const wantedTopic of lookupKeys) {
      const data = await httpJson<{
        id?: number;
        payload?: unknown;
        created_at?: string;
      } & CloudRow>(
        `${apiBaseUrl()}/v1/prepared-content/?kind=${encodeURIComponent(kind)}&topic_norm=${encodeURIComponent(wantedTopic)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // FastAPI LatestOut: { payload } | Django full row — ikkalasi ham
      if (data.payload == null) continue;
      return data.payload as T;
    }
    return null;
  } catch {
    return null;
  }
}
