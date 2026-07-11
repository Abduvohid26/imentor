import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../api/httpClient', () => ({
  httpJson: vi.fn(),
}));

vi.mock('./backendAuth', () => ({
  getBackendAccessToken: vi.fn().mockResolvedValue('token'),
}));

import { httpJson } from '../api/httpClient';
import { pollDevicePairingStatus } from './devicePairingApi';

describe('devicePairingApi', () => {
  beforeEach(() => {
    vi.mocked(httpJson).mockReset();
  });

  it('polls status with header secret only (no query leak)', async () => {
    vi.mocked(httpJson).mockResolvedValue({ status: 'pending' });
    await pollDevicePairingStatus('pair-token', 'desktop-secret');
    expect(httpJson).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/device-pair\/status\/pair-token\/$/),
      expect.objectContaining({
        headers: { 'X-Desktop-Secret': 'desktop-secret' },
      }),
    );
    const calledUrl = vi.mocked(httpJson).mock.calls[0]?.[0] as string;
    expect(calledUrl).not.toContain('secret=');
  });
});
