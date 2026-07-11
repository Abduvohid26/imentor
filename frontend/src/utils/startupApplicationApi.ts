import { httpJson } from '../api/httpClient';
import { unwrapPagedResults, type PagedResponse } from '../api/pagedResults';
import { getBackendAccessToken } from './backendAuth';

export type StartupApplicationDto = {
  id: number;
  owner_key: string;
  title: string;
  summary: string;
  description: string;
  participant_kind: string;
  project_domain?: 'startup' | 'research';
  workspace_profile?: Record<string, unknown>;
  profile_snapshot: Record<string, unknown>;
  ai_pack: Record<string, unknown>;
  /** Jamoa, hujjatlar, pitch — yuborish oldidan to‘ldiriladi */
  submission_dossier?: Record<string, unknown>;
  status: 'draft' | 'submitted';
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

function apiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.VITE_API_BASE_URL?.trim() || '/api';
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  return { Authorization: `Bearer ${token}` };
}

export async function listMyStartupApplications(): Promise<StartupApplicationDto[]> {
  const data = await httpJson<StartupApplicationDto[] | PagedResponse<StartupApplicationDto>>(
    `${apiBaseUrl()}/v1/startup-applications/`,
    {
      headers: await authHeaders(),
      timeoutMs: 30000,
    },
  );
  return unwrapPagedResults(data);
}

export async function createStartupApplication(body: {
  title: string;
  summary?: string;
  description?: string;
  participant_kind: 'student' | 'employee';
  project_domain?: 'startup' | 'research';
  workspace_profile?: Record<string, unknown>;
  profile_snapshot: Record<string, unknown>;
}): Promise<StartupApplicationDto> {
  return httpJson<StartupApplicationDto>(`${apiBaseUrl()}/v1/startup-applications/`, {
    method: 'POST',
    headers: await authHeaders(),
    body,
    timeoutMs: 30000,
  });
}

export async function updateStartupApplication(
  id: number,
  body: Partial<
    Pick<
      StartupApplicationDto,
      | 'title'
      | 'summary'
      | 'description'
      | 'ai_pack'
      | 'participant_kind'
      | 'project_domain'
      | 'workspace_profile'
      | 'profile_snapshot'
      | 'submission_dossier'
    >
  >
): Promise<StartupApplicationDto> {
  return httpJson<StartupApplicationDto>(`${apiBaseUrl()}/v1/startup-applications/${id}/`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body,
    timeoutMs: 30000,
  });
}

export async function deleteStartupApplication(id: number): Promise<void> {
  await httpJson<unknown>(`${apiBaseUrl()}/v1/startup-applications/${id}/`, {
    method: 'DELETE',
    headers: await authHeaders(),
    timeoutMs: 20000,
  });
}

export async function submitStartupApplication(id: number): Promise<StartupApplicationDto> {
  return httpJson<StartupApplicationDto>(`${apiBaseUrl()}/v1/startup-applications/${id}/submit/`, {
    method: 'POST',
    headers: await authHeaders(),
    body: {},
    timeoutMs: 20000,
  });
}

export async function listAdminStartupInbox(): Promise<StartupApplicationDto[]> {
  const data = await httpJson<StartupApplicationDto[] | PagedResponse<StartupApplicationDto>>(
    `${apiBaseUrl()}/v1/startup-applications/admin/inbox/`,
    {
      headers: await authHeaders(),
      timeoutMs: 30000,
    },
  );
  return unwrapPagedResults(data);
}
