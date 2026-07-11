import { httpJson, HttpError } from '../api/httpClient';
import { getBackendAccessToken } from './backendAuth';
import type { TestQuestion } from '../services/aiService';

/** Talaba uchun — javob kaliti va tushuntirishsiz savollar. */
export type StudentTestQuestion = Pick<TestQuestion, 'question' | 'options' | 'references'>;

export type LiveTestSessionPayload = {
  topic: string;
  questions: TestQuestion[];
  createdAt: number;
  isClosed?: boolean;
};

export type StudentLiveTestSessionPayload = Omit<LiveTestSessionPayload, 'questions'> & {
  questions: StudentTestQuestion[];
};

export function stripQuestionsForStudent(questions: TestQuestion[]): StudentTestQuestion[] {
  return questions.map((q) => {
    const item: StudentTestQuestion = {
      question: q.question,
      options: q.options,
    };
    if (q.references?.length) item.references = q.references;
    return item;
  });
}

export type LiveTestSubmissionRow = {
  firstName: string;
  lastName: string;
  answers: number[];
  submittedAt: number;
};

export type LiveTestFinalizeResult = {
  isClosed: boolean;
  autoSubmitted: number;
  submissions: LiveTestSubmissionRow[];
};

const PARTICIPANT_KEY_PREFIX = 'imentor-live-test-participant-';

/** Talaba QR rejimi: login talab qilinmaydi (`?mode=student&sid=` yoki `id=`). */
export function isPublicStudentTestUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  const sid = (p.get('sid') || p.get('id') || '').trim();
  return p.get('mode') === 'student' && sid.length > 0;
}

export function getLiveTestParticipantKey(sessionKey: string): string {
  const storageKey = `${PARTICIPANT_KEY_PREFIX}${sessionKey}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created = `lp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return `lp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function apiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.VITE_API_BASE_URL?.trim() || '/api';
}

function mapSubmissionRows(
  rows: Array<{
    first_name: string;
    last_name: string;
    answers: number[];
    submitted_at: string;
  }>
): LiveTestSubmissionRow[] {
  return rows.map((r) => ({
    firstName: r.first_name,
    lastName: r.last_name,
    answers: Array.isArray(r.answers) ? r.answers : [],
    submittedAt: Date.parse(r.submitted_at),
  }));
}

/** O‘qituvchi: sessiyani serverga yozadi (talaba QR boshqa qurilmada ochishi uchun). */
export async function createLiveTestSessionOnServer(
  payload: LiveTestSessionPayload
): Promise<string> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  const data = await httpJson<{ ok: boolean; session_key: string }>(`${apiBaseUrl()}/v1/live-tests/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      topic: payload.topic,
      questions: payload.questions,
      created_at_ms: payload.createdAt,
    },
    timeoutMs: 60000,
  });
  const sessionKey = data.session_key?.trim();
  if (!sessionKey) throw new Error('missing-session-key');
  return sessionKey;
}

/** O‘qituvchi: mavjud sessiyani serverga yangilaydi. */
export async function upsertLiveTestSessionOnServer(
  sessionKey: string,
  payload: LiveTestSessionPayload
): Promise<void> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  await httpJson(`${apiBaseUrl()}/v1/live-tests/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      session_key: sessionKey,
      topic: payload.topic,
      questions: payload.questions,
      created_at_ms: payload.createdAt,
    },
    timeoutMs: 60000,
  });
}

/** Serverda sessiya yo‘q bo‘lsa (yangi server / DB ko‘chirish) — qayta yozadi. */
export async function syncLiveTestSessionToServer(
  sessionKey: string,
  payload: LiveTestSessionPayload
): Promise<boolean> {
  try {
    await upsertLiveTestSessionOnServer(sessionKey, payload);
    return true;
  } catch {
    return false;
  }
}

/** Talaba: login talab qilinmaydi (javob kaliti yashirilgan). */
export async function fetchLiveTestSessionFromServer(
  sessionKey: string
): Promise<StudentLiveTestSessionPayload | null> {
  try {
    const data = await httpJson<{
      topic: string;
      questions: TestQuestion[];
      created_at_ms: number;
      is_closed?: boolean;
    }>(`${apiBaseUrl()}/v1/live-tests/${encodeURIComponent(sessionKey)}/`, {
      timeoutMs: 30000,
    });
    if (!data?.questions?.length) return null;
    return {
      topic: data.topic,
      questions: stripQuestionsForStudent(data.questions),
      createdAt: data.created_at_ms,
      isClosed: Boolean(data.is_closed),
    };
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  }
}

/** Talaba: draft javoblarni serverga saqlaydi (QR skaner qilgan, hali yubormagan). */
export async function upsertLiveTestDraftOnServer(
  sessionKey: string,
  body: {
    participantKey: string;
    firstName: string;
    lastName: string;
    answers: number[];
  }
): Promise<void> {
  await httpJson(`${apiBaseUrl()}/v1/live-tests/${encodeURIComponent(sessionKey)}/drafts/`, {
    method: 'POST',
    body: {
      participant_key: body.participantKey,
      first_name: body.firstName,
      last_name: body.lastName,
      answers: body.answers,
    },
    timeoutMs: 15000,
  });
}

/** Talaba: javoblarni serverga yuboradi. */
export async function submitLiveTestOnServer(
  sessionKey: string,
  body: { participantKey?: string; firstName: string; lastName: string; answers: number[] }
): Promise<void> {
  await httpJson(`${apiBaseUrl()}/v1/live-tests/${encodeURIComponent(sessionKey)}/submissions/`, {
    method: 'POST',
    body: {
      participant_key: body.participantKey || '',
      first_name: body.firstName,
      last_name: body.lastName,
      answers: body.answers,
    },
    timeoutMs: 30000,
  });
}

/** O‘qituvchi: draftlarni avtomatik topshirish va sessiyani yopish. */
export async function finalizeLiveTestSessionOnServer(sessionKey: string): Promise<LiveTestFinalizeResult> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  const data = await httpJson<{
    is_closed: boolean;
    auto_submitted: number;
    submissions: Array<{
      first_name: string;
      last_name: string;
      answers: number[];
      submitted_at: string;
    }>;
  }>(`${apiBaseUrl()}/v1/live-tests/${encodeURIComponent(sessionKey)}/finalize/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: 30000,
  });
  return {
    isClosed: Boolean(data.is_closed),
    autoSubmitted: data.auto_submitted ?? 0,
    submissions: mapSubmissionRows(Array.isArray(data.submissions) ? data.submissions : []),
  };
}

/** O‘qituvchi: realtime ro‘yxat (JWT). Sessiya serverda yo‘q bo‘lsa [] (404 konsol shovqinini oldini oladi). */
export async function fetchLiveTestSubmissionsFromServer(sessionKey: string): Promise<LiveTestSubmissionRow[]> {
  const token = await getBackendAccessToken();
  if (!token) return [];
  try {
    const rows = await httpJson<
      Array<{
        first_name: string;
        last_name: string;
        answers: number[];
        submitted_at: string;
      }>
    >(`${apiBaseUrl()}/v1/live-tests/${encodeURIComponent(sessionKey)}/submissions/`, {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 20000,
    });
    if (!Array.isArray(rows)) return [];
    return mapSubmissionRows(rows);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return [];
    throw e;
  }
}
