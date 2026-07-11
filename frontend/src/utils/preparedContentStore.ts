import { getCurrentLocalUser } from './localStaffAuth';
import { httpJson } from '../api/httpClient';
import { getBackendAccessToken } from './backendAuth';

export type PreparedContentKind = 'lecture' | 'presentation' | 'case' | 'test';

interface PreparedContentRecord {
  id: string;
  ownerKey: string;
  kind: PreparedContentKind;
  topic: string;
  topicNorm: string;
  payload: unknown;
  createdAt: number;
  source: 'local' | 'cloud';
}

const LOCAL_KEY_PREFIX = 'salomatlik-prepared-content-v1';
const MAX_LOCAL_PER_KIND = 80;

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

function localKey(owner: string, kind: PreparedContentKind): string {
  return `${LOCAL_KEY_PREFIX}:${owner}:${kind}`;
}

function apiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.VITE_API_BASE_URL?.trim() || '/api';
}

function readLocal(owner: string, kind: PreparedContentKind): PreparedContentRecord[] {
  try {
    const raw = localStorage.getItem(localKey(owner, kind));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PreparedContentRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(owner: string, kind: PreparedContentKind, rows: PreparedContentRecord[]): void {
  localStorage.setItem(localKey(owner, kind), JSON.stringify(rows.slice(0, MAX_LOCAL_PER_KIND)));
}

export type PreparedContentMeta = {
  authorDisplayName?: string;
  subjectName?: string;
  subjectCode?: string;
};

export async function savePreparedContent(
  kind: PreparedContentKind,
  topic: string,
  payload: unknown,
  meta?: PreparedContentMeta
): Promise<void> {
  const owner = ownerKey();
  if (!owner) return;
  const now = Date.now();
  const rec: PreparedContentRecord = {
    id: `prep_${now}_${Math.random().toString(36).slice(2, 8)}`,
    ownerKey: owner,
    kind,
    topic: topic.trim() || 'Nomsiz',
    topicNorm: normTopic(topic),
    payload,
    createdAt: now,
    source: 'local',
  };
  const localRows = [rec, ...readLocal(owner, kind)];
  writeLocal(owner, kind, localRows);

  try {
    const token = await getBackendAccessToken();
    if (!token) return;
    await httpJson(`${apiBaseUrl()}/v1/prepared-content/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: {
        owner_key: rec.ownerKey,
        kind: rec.kind,
        topic: rec.topic,
        topic_norm: rec.topicNorm,
        author_display_name: meta?.authorDisplayName?.trim() || '',
        subject_name: meta?.subjectName?.trim() || '',
        subject_code: meta?.subjectCode?.trim() || '',
        payload: rec.payload,
      },
    });
  } catch {
    /* cloud is best-effort; local already saved */
  }
}

export type PreparedContentSummary = {
  id: string;
  topic: string;
  createdAt: number;
  source: 'local' | 'cloud';
};

export function listPreparedForTopic(kind: PreparedContentKind, topic: string): PreparedContentSummary[] {
  const owner = ownerKey();
  if (!owner || !topic.trim()) return [];
  const wanted = normTopic(topic);
  return readLocal(owner, kind)
    .filter((r) => r.topicNorm === wanted)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => ({
      id: r.id,
      topic: r.topic,
      createdAt: r.createdAt,
      source: r.source,
    }));
}

/** Barcha mavzular bo‘yicha saqlangan versiyalar (ma'ruza tarixi va h.k.) */
export function listAllPreparedForKind(kind: PreparedContentKind): PreparedContentSummary[] {
  const owner = ownerKey();
  if (!owner) return [];
  return readLocal(owner, kind)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => ({
      id: r.id,
      topic: r.topic,
      createdAt: r.createdAt,
      source: r.source,
    }));
}

export function loadPreparedById<T>(kind: PreparedContentKind, id: string): T | null {
  const owner = ownerKey();
  if (!owner) return null;
  const row = readLocal(owner, kind).find((r) => r.id === id);
  return row ? (row.payload as T) : null;
}

export async function deletePreparedContent(kind: PreparedContentKind, id: string): Promise<void> {
  const owner = ownerKey();
  if (!owner) return;
  const rows = readLocal(owner, kind).filter((r) => r.id !== id);
  writeLocal(owner, kind, rows);

  const cloudId = /^\d+$/.test(id) ? id : null;
  if (cloudId) {
    try {
      const token = await getBackendAccessToken();
      if (!token) return;
      await httpJson(`${apiBaseUrl()}/v1/prepared-content/${cloudId}/`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      /* local already removed */
    }
  }
}

export async function loadLatestPreparedContent<T>(
  kind: PreparedContentKind,
  topic: string
): Promise<T | null> {
  const owner = ownerKey();
  if (!owner) return null;
  const wantedTopic = normTopic(topic);
  if (!wantedTopic) return null;

  const localMatch = readLocal(owner, kind)
    .filter((r) => r.topicNorm === wantedTopic)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (localMatch) return localMatch.payload as T;

  try {
    const token = await getBackendAccessToken();
    if (!token) return null;
    const data = await httpJson<{
      id?: string | number;
      topic?: string;
      topic_norm?: string;
      payload?: unknown;
      created_at?: string;
    }>(
      `${apiBaseUrl()}/v1/prepared-content/?kind=${encodeURIComponent(kind)}&topic_norm=${encodeURIComponent(wantedTopic)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const cloudRow: PreparedContentRecord = {
      id: String(data.id || `cloud_${Date.now()}`),
      ownerKey: owner,
      kind,
      topic: String(data.topic || topic),
      topicNorm: String(data.topic_norm || wantedTopic),
      payload: data.payload,
      createdAt: data.created_at ? Date.parse(data.created_at) : Date.now(),
      source: 'cloud',
    };
    if (cloudRow.payload == null) return null;
    writeLocal(owner, kind, [cloudRow, ...readLocal(owner, kind)]);
    return cloudRow.payload as T;
  } catch {
    return null;
  }
}
