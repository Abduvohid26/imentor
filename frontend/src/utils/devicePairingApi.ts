import { httpJson } from '../api/httpClient';
import { getBackendAccessToken } from './backendAuth';
import type { LocalStaffUser } from './localStaffAuth';

function apiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.VITE_API_BASE_URL?.trim() || '/api';
}

export type DevicePairCreateResponse = {
  pairing_token: string;
  desktop_secret: string;
  expires_at: string;
  qr_payload: string;
};

export type DevicePairStatusResponse = {
  status: string;
  expires_at?: string;
  access?: string;
  refresh?: string;
  role?: string;
  username?: string;
  profile?: Partial<LocalStaffUser>;
};

export async function createDevicePairingSession(): Promise<DevicePairCreateResponse> {
  return httpJson(`${apiBaseUrl()}/v1/device-pair/create/`, {
    method: 'POST',
    body: {},
    timeoutMs: 15000,
  });
}

export async function pollDevicePairingStatus(
  token: string,
  desktopSecret: string,
): Promise<DevicePairStatusResponse> {
  const headers: Record<string, string> = {};
  if (desktopSecret) {
    headers['X-Desktop-Secret'] = desktopSecret;
  }
  return httpJson(
    `${apiBaseUrl()}/v1/device-pair/status/${encodeURIComponent(token)}/`,
    {
      headers,
      timeoutMs: 12000,
    },
  );
}

export async function confirmDevicePairing(
  pairingToken: string,
  profile: LocalStaffUser,
): Promise<{ status: string; ok?: boolean }> {
  const access = await getBackendAccessToken();
  if (!access) throw new Error('no-backend-token');
  return httpJson(`${apiBaseUrl()}/v1/device-pair/confirm/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}` },
    body: {
      pairing_token: pairingToken,
      profile: {
        uid: profile.uid,
        displayName: profile.displayName,
        firstName: profile.firstName,
        lastName: profile.lastName,
        phoneDisplay: profile.phoneDisplay,
        phoneDigits: profile.phoneDigits,
        faculty: profile.faculty,
        department: profile.department,
        direction: profile.direction,
        email: profile.email,
      },
    },
    timeoutMs: 20000,
  });
}

/** QR matnidan token ajratish */
export function parsePairingTokenFromScan(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const prefix = 'imentor-pair:';
  if (t.startsWith(prefix)) return t.slice(prefix.length).trim() || null;
  try {
    const u = new URL(t);
    const q = u.searchParams.get('pair') || u.searchParams.get('token');
    if (q) return q.trim();
    const path = u.pathname.replace(/\/$/, '');
    const last = path.split('/').pop();
    if (last && last.length >= 16) return last;
  } catch {
    /* not a url */
  }
  if (t.length >= 16 && t.length <= 80 && !/\s/.test(t)) return t;
  return null;
}
