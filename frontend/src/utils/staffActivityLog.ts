/** Hodimlar kirish/chiqish va ro‘yxatdan o‘tishlarini localStorage’da jurnal qilish (frontend-only). */

export type ActivityKind = 'login' | 'logout' | 'register';

export interface StaffActivityEntry {
  id: string;
  at: number;
  kind: ActivityKind;
  uid: string;
  displayName: string;
  role: 'admin' | 'hodim' | 'startuper';
  phoneDigits: string;
}

const STORAGE_KEY = 'salomatlik-staff-activity-log-v1';
const MAX_ENTRIES = 800;

function readEntries(): StaffActivityEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StaffActivityEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: StaffActivityEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

/**
 * Kirish, chiqish yoki ro‘yxatdan o‘tish hodisasini yozadi (oxirgi yozuvlar ustiga qo‘shiladi).
 */
export function logStaffActivity(
  payload: Omit<StaffActivityEntry, 'id' | 'at'> & { id?: string; at?: number }
): void {
  const entry: StaffActivityEntry = {
    id: payload.id ?? `act_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    at: payload.at ?? Date.now(),
    kind: payload.kind,
    uid: payload.uid,
    displayName: payload.displayName,
    role: payload.role,
    phoneDigits: payload.phoneDigits,
  };
  const prev = readEntries();
  writeEntries([entry, ...prev]);
}

export function getStaffActivityEntries(): StaffActivityEntry[] {
  return readEntries().sort((a, b) => b.at - a.at);
}

export interface ActivitySummary {
  totalLogins: number;
  totalLogouts: number;
  totalRegisters: number;
  loginsToday: number;
  logoutsToday: number;
  uniqueUsersToday: number;
  lastSevenDaysLogins: number;
}

export function getActivitySummary(): ActivitySummary {
  const entries = readEntries();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const t0 = todayStart.getTime();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  let totalLogins = 0;
  let totalLogouts = 0;
  let totalRegisters = 0;
  let loginsToday = 0;
  let logoutsToday = 0;
  let lastSevenDaysLogins = 0;
  const uidsToday = new Set<string>();

  for (const e of entries) {
    if (e.kind === 'login') {
      totalLogins++;
      if (e.at >= t0) {
        loginsToday++;
        uidsToday.add(e.uid);
      }
      if (e.at >= weekAgo) lastSevenDaysLogins++;
    } else if (e.kind === 'logout') {
      totalLogouts++;
      if (e.at >= t0) logoutsToday++;
    } else if (e.kind === 'register') {
      totalRegisters++;
    }
  }

  return {
    totalLogins,
    totalLogouts,
    totalRegisters,
    loginsToday,
    logoutsToday,
    uniqueUsersToday: uidsToday.size,
    lastSevenDaysLogins,
  };
}
