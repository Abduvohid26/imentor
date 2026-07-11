import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpError, httpJson, setHttpTokenRefresher } from './httpClient';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('httpJson', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    setHttpTokenRefresher(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setHttpTokenRefresher(null);
  });

  it('returns parsed JSON on success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await expect(httpJson('/api/health/')).resolves.toEqual({ ok: true });
  });

  it('throws HttpError on failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { detail: 'xato' }));
    await expect(httpJson('/api/bad/')).rejects.toMatchObject({ status: 400 });
  });

  it('retries once after 401 when refresher returns a new token', async () => {
    const refresher = vi.fn().mockResolvedValue('fresh-token');
    setHttpTokenRefresher(refresher);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const result = await httpJson<{ ok: boolean }>('/api/protected/', {
      headers: { Authorization: 'Bearer stale-token' },
    });

    expect(result).toEqual({ ok: true });
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryCall = fetchMock.mock.calls[1];
    const retryInit = retryCall?.[1] as RequestInit | undefined;
    const retryHeaders = (retryInit?.headers || {}) as Record<string, string>;
    expect(retryHeaders.Authorization).toBe('Bearer fresh-token');
  });

  it('does not retry when refresher returns null', async () => {
    setHttpTokenRefresher(vi.fn().mockResolvedValue(null));
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { detail: 'expired' }));

    await expect(
      httpJson('/api/protected/', {
        headers: { Authorization: 'Bearer stale-token' },
      }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
