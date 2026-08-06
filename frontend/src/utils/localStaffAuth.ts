import { logStaffActivity } from './staffActivityLog';

/** admin — to‘liq kirish; hodim — ta'lim; student — OnlineTest talaba */
export type UserRole = 'admin' | 'hodim' | 'student';

export interface LocalStaffUser {
  uid: string;
  displayName: string;
  firstName: string;
  lastName: string;
  phoneDisplay: string;
  phoneDigits: string;
  faculty: string;
  department: string;
  direction: string;
  email: string;
  password: string;
  /** Agar eski hisoblarda bo‘lmasa, `hodim` deb qabul qilinadi */
  role?: UserRole;
  createdAt: number;
  updatedAt?: number;
  /** Unix ms — oxirgi kirish yoki tizimdagi so‘nggi faollik */
  lastActiveAt?: number;
  photoURL?: string | null;
  /** Legacy optional fields (eski startuper profili) */
  participantKind?: 'student' | 'employee';
  /** Talaba: o‘quv guruhi */
  studyGroup?: string;
  /** OnlineTest AppUser.id (faqat role=student) */
  onlineTestStudentId?: string;
  /** Xodim: lavozim */
  jobTitle?: string;
}

const USERS_KEY = 'salomatlik-local-staff-users-v1';
const SESSION_KEY = 'salomatlik-local-staff-session-v1';
const AUTH_EVENT = 'salomatlik-local-auth-changed';

/** Parollar localStorage'da saqlanmaydi — faqat server JWT orqali autentifikatsiya. */
const PASSWORD_NOT_STORED = '';

function withoutStoredPassword(user: LocalStaffUser): LocalStaffUser {
  return { ...user, password: PASSWORD_NOT_STORED };
}

export const TEST_STAFF_PHONE = '+998901112233';
export const TEST_ADMIN_PHONE = '+998901110001';

type DemoRoleLogin = {
  role: UserRole;
  title: string;
  subtitle: string;
  phone: string;
  password: string;
};

function readDemoEnv(key: string): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return (env?.[key] || '').trim();
}

/** Demo kirish — faqat dev va VITE_DEMO_*_PASSWORD sozlangan bo'lsa. */
export function getDemoRoleLogins(): DemoRoleLogin[] {
  if (!isDemoAuthEnabled()) return [];
  const entries: DemoRoleLogin[] = [
    {
      role: 'admin',
      title: 'Admin',
      subtitle: 'Barcha modullar',
      phone: readDemoEnv('VITE_DEMO_ADMIN_PHONE') || TEST_ADMIN_PHONE,
      password: readDemoEnv('VITE_DEMO_ADMIN_PASSWORD'),
    },
    {
      role: 'hodim',
      title: "O'qituvchi",
      subtitle: "Ta'lim modullari",
      phone: readDemoEnv('VITE_DEMO_STAFF_PHONE') || TEST_STAFF_PHONE,
      password: readDemoEnv('VITE_DEMO_STAFF_PASSWORD'),
    },
  ];
  return entries.filter((e) => e.password.length >= 6);
}

export function normalizeUserRole(user: LocalStaffUser | null | undefined): UserRole {
  const r = user?.role as string | undefined;
  if (r === 'admin' || r === 'hodim' || r === 'student') return r;
  // Legacy roles
  if (r === 'startuper' || r === 'tarjimon') return 'hodim';
  return 'hodim';
}

function withRoleDefault(u: LocalStaffUser): LocalStaffUser {
  return { ...u, role: normalizeUserRole(u) };
}

function upsertDemoUser(user: LocalStaffUser): void {
  const users = readUsers();
  const idx = users.findIndex((x) => x.phoneDigits === user.phoneDigits);
  if (idx >= 0) {
    const merged: LocalStaffUser = {
      ...users[idx],
      ...user,
      uid: users[idx].uid,
      phoneDigits: user.phoneDigits,
      password: user.password,
      role: user.role,
      createdAt: users[idx].createdAt,
      updatedAt: Date.now(),
    };
    users[idx] = merged;
  } else {
    users.unshift(user);
  }
  writeUsers(users);
}

/** Productionda demo hisoblar yaratilmaydi (faqat dev + VITE_DEMO_* parollari). */
export function isDemoAuthEnabled(): boolean {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env;
  if (env?.PROD && env?.VITE_ENABLE_DEMO_AUTH !== 'true') return false;
  return Boolean(env?.DEV) || env?.VITE_ENABLE_DEMO_AUTH === 'true';
}

/** Demo rollar uchun mahalliy profil (parol saqlanmaydi — server login). */
export function ensureDefaultRoleDemosExist(): void {
  if (!isDemoAuthEnabled()) return;
  const demos = getDemoRoleLogins();
  if (demos.length === 0) return;
  const now = Date.now();

  for (const demo of demos) {
    const digits = normalizePhoneDigits(demo.phone);
    upsertDemoUser({
      uid: `demo_${demo.role}_${digits}`,
      displayName: demo.title,
      firstName: 'Demo',
      lastName: demo.title,
      phoneDisplay: demo.phone,
      phoneDigits: digits,
      faculty: demo.role === 'admin' ? 'Administrator' : 'Tibbiyot fakulteti',
      department: demo.role === 'admin' ? 'Tizim' : 'Ichki kasalliklar kafedrasi',
      direction: demo.role === 'admin' ? "To'liq kirish" : "Terapiya yo'nalishi",
      email: phoneDigitsToEmail(digits),
      password: PASSWORD_NOT_STORED,
      role: demo.role,
      createdAt: now,
      updatedAt: now,
      photoURL: null,
    });
  }
}

function readUsers(): LocalStaffUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalStaffUser[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(withoutStoredPassword);
  } catch {
    return [];
  }
}

function writeUsers(users: LocalStaffUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users.map(withoutStoredPassword)));
}

/** Sessiyada parol saqlanmaydi — faqat users ro‘yxatida. */
function sessionSnapshot(user: LocalStaffUser): LocalStaffUser {
  return { ...withRoleDefault(user), password: '' };
}

function hydrateSessionUser(session: LocalStaffUser): LocalStaffUser {
  const users = readUsers();
  const stored =
    users.find((u) => u.uid === session.uid) ??
    users.find((u) => u.phoneDigits === session.phoneDigits);
  if (!stored) return withRoleDefault(withoutStoredPassword(session));
  return withRoleDefault({
    ...stored,
    ...session,
    password: PASSWORD_NOT_STORED,
    role: stored.role ?? session.role,
  });
}

function emitAuthChanged(): void {
  window.dispatchEvent(new CustomEvent(AUTH_EVENT));
}

export function subscribeLocalAuth(listener: () => void): () => void {
  const handler = () => listener();
  window.addEventListener(AUTH_EVENT, handler);
  return () => window.removeEventListener(AUTH_EVENT, handler);
}

export function getCurrentLocalUser(): LocalStaffUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as LocalStaffUser;
    return hydrateSessionUser(u);
  } catch {
    return null;
  }
}

export function normalizePhoneDigits(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 9) return `998${digits}`;
  if (digits.length === 12 && digits.startsWith('998')) return digits;
  if (digits.length === 10 && digits.startsWith('0')) return `998${digits.slice(1)}`;
  return digits;
}

export function isValidPhoneDigits(digits: string): boolean {
  return digits.length === 12 && digits.startsWith('998');
}

export function phoneDigitsToEmail(digits: string): string {
  return `phone_${digits}@local.staff`;
}

export interface RegisterLocalInput {
  phoneDisplay: string;
  password: string;
  firstName: string;
  lastName: string;
  faculty: string;
  department: string;
  direction: string;
  /** Standart ro‘yxatdan o‘tishda default hodim */
  role?: UserRole;
  participantKind?: 'student' | 'employee';
  studyGroup?: string;
  jobTitle?: string;
}

export function registerLocalStaff(input: RegisterLocalInput): LocalStaffUser {
  const digits = normalizePhoneDigits(input.phoneDisplay);
  if (!isValidPhoneDigits(digits)) throw new Error('invalid-phone');
  if (input.password.length < 6) throw new Error('weak-password');

  const users = readUsers();
  const exists = users.some((u) => u.phoneDigits === digits);
  if (exists) throw new Error('already-exists');

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const now = Date.now();
  const role = input.role === 'admin' || input.role === 'student' ? input.role : 'hodim';

  const user: LocalStaffUser = {
    uid: `local_${now}_${Math.random().toString(36).slice(2, 8)}`,
    displayName: `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    phoneDisplay: input.phoneDisplay.trim(),
    phoneDigits: digits,
    faculty: input.faculty.trim(),
    department: input.department.trim(),
    direction: input.direction.trim(),
    email: phoneDigitsToEmail(digits),
    password: input.password,
    role,
    participantKind: input.participantKind,
    studyGroup: input.studyGroup?.trim() || undefined,
    jobTitle: input.jobTitle?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
    photoURL: null,
  };
  users.unshift(user);
  writeUsers(users);
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionSnapshot(user)));
  emitAuthChanged();
  logStaffActivity({
    kind: 'register',
    uid: user.uid,
    displayName: user.displayName,
    role: normalizeUserRole(user),
    phoneDigits: user.phoneDigits,
  });
  return user;
}

const LAST_ACTIVE_MIN_TOUCH_MS = 60_000;

/**
 * Joriy sessiya bo‘yicha foydalanuvchining `lastActiveAt`ini yangilaydi (throttle).
 * Kirishdan tashqari — sahifa ochilganda yoki oynaga qaytishda chaqiriladi.
 */
export function touchCurrentUserActivityIfNeeded(): void {
  const session = getCurrentLocalUser();
  if (!session) return;
  const users = readUsers();
  const idx = users.findIndex((u) => u.uid === session.uid);
  if (idx < 0) return;
  const prev = users[idx].lastActiveAt ?? 0;
  const now = Date.now();
  if (now - prev < LAST_ACTIVE_MIN_TOUCH_MS) return;
  const updated: LocalStaffUser = {
    ...withRoleDefault(users[idx]),
    lastActiveAt: now,
    updatedAt: now,
  };
  users[idx] = updated;
  writeUsers(users);
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionSnapshot(updated)));
  emitAuthChanged();
}

/** QR juftlash yoki serverdan kelgan profil bilan sessiya (kompyuter) */
export function establishLocalSessionFromProfile(profile: LocalStaffUser): LocalStaffUser {
  const users = readUsers();
  const idx = users.findIndex((u) => u.phoneDigits === profile.phoneDigits);
  const now = Date.now();
  const existing = idx >= 0 ? users[idx] : null;
  const sessionUser = withRoleDefault({
    ...(existing ?? profile),
    ...profile,
    uid: existing?.uid ?? profile.uid,
    password: PASSWORD_NOT_STORED,
    lastActiveAt: now,
    updatedAt: now,
  });
  if (idx >= 0) {
    users[idx] = sessionUser;
  } else {
    users.unshift(sessionUser);
  }
  writeUsers(users);
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionSnapshot(sessionUser)));
  emitAuthChanged();
  return sessionUser;
}

export function loginLocalStaff(phoneInput: string, _password: string): LocalStaffUser {
  const digits = normalizePhoneDigits(phoneInput);
  const users = readUsers();
  const idx = users.findIndex((u) => u.phoneDigits === digits);
  if (idx < 0) throw new Error('user-not-found');
  const now = Date.now();
  const sessionUser = withRoleDefault({
    ...users[idx],
    lastActiveAt: now,
    updatedAt: now,
  });
  users[idx] = sessionUser;
  writeUsers(users);
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionSnapshot(sessionUser)));
  emitAuthChanged();
  logStaffActivity({
    kind: 'login',
    uid: sessionUser.uid,
    displayName: sessionUser.displayName,
    role: normalizeUserRole(sessionUser),
    phoneDigits: sessionUser.phoneDigits,
  });
  return sessionUser;
}

/** Server JWT roli bilan mahalliy sessiyani moslashtirish (403 oldini olish). */
export function syncCurrentUserRoleFromServer(role: UserRole): void {
  const current = getCurrentLocalUser();
  if (!current || normalizeUserRole(current) === role) return;
  const users = readUsers();
  const idx = users.findIndex((u) => u.uid === current.uid);
  if (idx < 0) return;
  const updated = withRoleDefault({ ...users[idx], role, updatedAt: Date.now() });
  users[idx] = updated;
  writeUsers(users);
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionSnapshot(updated)));
  emitAuthChanged();
}

export function updateCurrentLocalUser(
  patch: Partial<
    Pick<
      LocalStaffUser,
      | 'firstName'
      | 'lastName'
      | 'displayName'
      | 'phoneDisplay'
      | 'faculty'
      | 'department'
      | 'direction'
      | 'password'
      | 'role'
      | 'participantKind'
      | 'studyGroup'
      | 'jobTitle'
      | 'photoURL'
      | 'onlineTestStudentId'
    >
  >
): LocalStaffUser {
  const current = getCurrentLocalUser();
  if (!current) throw new Error('not-authenticated');
  const users = readUsers();
  const idx = users.findIndex((u) => u.uid === current.uid);
  if (idx < 0) throw new Error('not-found');

  const updated: LocalStaffUser = withRoleDefault({
    ...users[idx],
    ...patch,
    updatedAt: Date.now(),
  });
  if (updated.phoneDisplay) {
    const digits = normalizePhoneDigits(updated.phoneDisplay);
    if (isValidPhoneDigits(digits)) {
      updated.phoneDigits = digits;
      updated.email = phoneDigitsToEmail(digits);
    }
  }
  users[idx] = updated;
  writeUsers(users);
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionSnapshot(updated)));
  emitAuthChanged();
  return updated;
}

export function logoutLocalStaff(): void {
  const current = getCurrentLocalUser();
  if (current) {
    logStaffActivity({
      kind: 'logout',
      uid: current.uid,
      displayName: current.displayName,
      role: normalizeUserRole(current),
      phoneDigits: current.phoneDigits,
    });
  }
  localStorage.removeItem(SESSION_KEY);
  emitAuthChanged();
}

function assertAdmin(): void {
  const u = getCurrentLocalUser();
  if (!u || normalizeUserRole(u) !== 'admin') {
    throw new Error('forbidden');
  }
}

/** Barcha hisoblar (faqat administrator uchun UI) */
export function listAllStaffUsers(): LocalStaffUser[] {
  assertAdmin();
  return readUsers().map(withRoleDefault);
}

export interface AdminMutateStaffInput {
  phoneDisplay: string;
  password: string;
  firstName: string;
  lastName: string;
  faculty: string;
  department: string;
  direction: string;
  role: UserRole;
  participantKind?: 'student' | 'employee';
  studyGroup?: string;
  jobTitle?: string;
}

export function adminCreateStaffUser(input: AdminMutateStaffInput): LocalStaffUser {
  assertAdmin();
  const digits = normalizePhoneDigits(input.phoneDisplay);
  if (!isValidPhoneDigits(digits)) throw new Error('invalid-phone');
  if (input.password.length < 6) throw new Error('weak-password');
  const users = readUsers();
  if (users.some((u) => u.phoneDigits === digits)) throw new Error('already-exists');

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const now = Date.now();
  const user: LocalStaffUser = {
    uid: `local_${now}_${Math.random().toString(36).slice(2, 8)}`,
    displayName: `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    phoneDisplay: input.phoneDisplay.trim(),
    phoneDigits: digits,
    faculty: input.faculty.trim(),
    department: input.department.trim(),
    direction: input.direction.trim(),
    email: phoneDigitsToEmail(digits),
    password: input.password,
    role: input.role,
    participantKind: input.participantKind,
    studyGroup: input.studyGroup?.trim() || undefined,
    jobTitle: input.jobTitle?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    photoURL: null,
  };
  users.unshift(user);
  writeUsers(users);
  emitAuthChanged();
  return user;
}

export function adminUpdateStaffUser(
  uid: string,
  patch: Partial<
    Pick<
      LocalStaffUser,
      | 'firstName'
      | 'lastName'
      | 'displayName'
      | 'phoneDisplay'
      | 'faculty'
      | 'department'
      | 'direction'
      | 'password'
      | 'role'
      | 'participantKind'
      | 'studyGroup'
      | 'jobTitle'
    >
  >
): LocalStaffUser {
  assertAdmin();
  const users = readUsers();
  const idx = users.findIndex((u) => u.uid === uid);
  if (idx < 0) throw new Error('not-found');

  const existing = withRoleDefault(users[idx]);
  const merged: LocalStaffUser = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  };
  if (patch.phoneDisplay) {
    const d = normalizePhoneDigits(patch.phoneDisplay);
    if (isValidPhoneDigits(d) && d !== existing.phoneDigits) {
      if (users.some((u, i) => i !== idx && u.phoneDigits === d)) {
        throw new Error('phone-exists');
      }
      merged.phoneDigits = d;
      merged.email = phoneDigitsToEmail(d);
    }
  }
  if (merged.firstName || merged.lastName) {
    merged.displayName = `${merged.firstName} ${merged.lastName}`.trim();
  }
  if (patch.role !== undefined && normalizeUserRole(existing) === 'admin') {
    const adminCount = users.filter((u) => normalizeUserRole(withRoleDefault(u)) === 'admin').length;
    if (adminCount <= 1 && patch.role !== 'admin') {
      throw new Error('last-admin');
    }
  }
  users[idx] = withRoleDefault(merged);
  writeUsers(users);

  const session = getCurrentLocalUser();
  if (session?.uid === uid) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionSnapshot(merged)));
  }
  emitAuthChanged();
  return merged;
}

export function adminDeleteStaffUser(uid: string): void {
  assertAdmin();
  const current = getCurrentLocalUser()!;
  if (current.uid === uid) throw new Error('cannot-delete-self');
  const users = readUsers();
  const target = users.find((u) => u.uid === uid);
  if (!target) throw new Error('not-found');
  if (normalizeUserRole(withRoleDefault(target)) === 'admin') {
    const admins = users.filter((u) => normalizeUserRole(withRoleDefault(u)) === 'admin').length;
    if (admins <= 1) throw new Error('last-admin');
  }
  writeUsers(users.filter((u) => u.uid !== uid));
  emitAuthChanged();
}
