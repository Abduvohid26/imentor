import { HttpError } from '../api/httpClient';
import { getBackendAccessToken } from './backendAuth';
import { normTopicKey } from './preparedContentStore';

export type PresentationKind = 'pdf' | 'ppt' | 'pptx';

export type TopicPresentationItem = {
  id: number;
  owner_key: string;
  author_name: string;
  topic: string;
  topic_norm: string;
  title: string;
  kind: PresentationKind;
  file_name: string;
  file_size: number;
  file_url: string;
  can_delete: boolean;
  sort_order: number;
  created_at: string;
};

const blobCache = new Map<number, string>();

function apiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.VITE_API_BASE_URL?.trim() || '/api';
}

export function resolvePresentationFileUrl(fileUrl: string): string {
  if (!fileUrl) return '';
  try {
    const u = new URL(fileUrl, window.location.origin);
    if (u.pathname.startsWith('/media/')) {
      return `${window.location.origin}${u.pathname}${u.search}`;
    }
    return u.href;
  } catch {
    if (fileUrl.startsWith('/')) return `${window.location.origin}${fileUrl}`;
    return fileUrl;
  }
}

export async function getPresentationFileBlobUrl(id: number): Promise<string> {
  const cached = blobCache.get(id);
  if (cached) return cached;
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  const res = await fetch(`${apiBaseUrl()}/v1/presentations/${id}/file/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new HttpError(`HTTP ${res.status}`, res.status, null);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  blobCache.set(id, url);
  return url;
}

export function normPresentationTopic(topic: string): string {
  return normTopicKey(topic);
}

export async function fetchPresentationsForTopic(topic: string): Promise<TopicPresentationItem[]> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  const topicNorm = normPresentationTopic(topic);
  const res = await fetch(
    `${apiBaseUrl()}/v1/presentations/?topic_norm=${encodeURIComponent(topicNorm)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const text = await res.text();
  let data: unknown = [];
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) throw new HttpError(`HTTP ${res.status}`, res.status, data);
  return Array.isArray(data) ? (data as TopicPresentationItem[]) : [];
}

export async function uploadPresentation(params: {
  topic: string;
  file: File;
  title?: string;
}): Promise<TopicPresentationItem> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  const form = new FormData();
  form.append('topic', params.topic.trim());
  form.append('topic_norm', normPresentationTopic(params.topic));
  form.append('file', params.file);
  if (params.title?.trim()) form.append('title', params.title.trim());

  const res = await fetch(`${apiBaseUrl()}/v1/presentations/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) throw new HttpError(`HTTP ${res.status}`, res.status, data);
  return data as TopicPresentationItem;
}

export async function deletePresentation(id: number): Promise<void> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  const res = await fetch(`${apiBaseUrl()}/v1/presentations/${id}/`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 204) {
    throw new HttpError(`HTTP ${res.status}`, res.status, null);
  }
  const cached = blobCache.get(id);
  if (cached) {
    URL.revokeObjectURL(cached);
    blobCache.delete(id);
  }
}

export function isAllowedPresentationFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ['.pdf', '.ppt', '.pptx'].some((e) => name.endsWith(e));
}
