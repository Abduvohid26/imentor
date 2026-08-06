import { httpJson, HttpError } from '../api/httpClient';
import { unwrapPagedResults, type PagedResponse } from '../api/pagedResults';
import { getBackendAccessToken } from './backendAuth';
import type { SyllabusTopic } from '../services/aiService';
import type { AppLanguage } from '../i18n/language';
import type { SyllabusVariant } from './syllabusVariant';

/** Markaziy fan syllabus (admin katalog) */
export type CourseSyllabusRow = {
  id: number;
  subject_name: string;
  subject_code: string;
  description: string;
  instruction_language?: AppLanguage;
  file_name: string;
  topics: SyllabusTopic[];
  variants: SyllabusVariant[];
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  department?: number | null;
  department_name?: string;
  department_code?: string;
};

export type StaffCourseSelectionRow = {
  id: number;
  syllabus: CourseSyllabusRow;
  /** Admin qat'iy biriktirgan bo'lsa — aynan shu variant/yo'nalish; bo'sh = erkin. */
  variant_label: string;
  selected_at: string;
};

/** Admin ko'rinishi: fanga biriktirilgan o'qituvchi (owner_key bilan) */
export type AdminStaffCourseSelectionRow = {
  id: number;
  owner_key: string;
  owner_name: string;
  owner_phone_display: string;
  syllabus: CourseSyllabusRow;
  variant_label: string;
  selected_at: string;
};

export type ClientSyllabusDocument = {
  id: string;
  serverId?: number;
  fileName: string;
  topics: SyllabusTopic[];
  createdAt: number;
};

function apiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.VITE_API_BASE_URL?.trim() || '/api';
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export type SyllabusCatalogStats = {
  departments_count: number;
  subjects_count: number;
  subjects_total: number;
  variants_count: number;
  topics_count: number;
  by_department: {
    name: string;
    code: string;
    subjects_count: number;
  }[];
};

// ——— Admin: markaziy katalog ———

export async function fetchAdminSyllabusCatalogStats(): Promise<SyllabusCatalogStats | null> {
  const token = await getBackendAccessToken();
  if (!token) return null;
  return httpJson<SyllabusCatalogStats>(`${apiBaseUrl()}/v1/admin/course-syllabuses/stats/`, {
    headers: authHeaders(token),
    timeoutMs: 30000,
  });
}

export async function fetchAdminCourseSyllabuses(): Promise<CourseSyllabusRow[]> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  // Fan katalogi to'liq kelishi kerak — default page_size=50 yetarli emas.
  const data = await httpJson<CourseSyllabusRow[] | PagedResponse<CourseSyllabusRow>>(
    `${apiBaseUrl()}/v1/admin/course-syllabuses/?page_size=1000`,
    {
      headers: authHeaders(token),
      timeoutMs: 60000,
    },
  );
  return unwrapPagedResults(data);
}

export async function createAdminCourseSyllabus(payload: {
  subject_name: string;
  subject_code?: string;
  description?: string;
  instruction_language?: AppLanguage;
  file_name?: string;
  topics?: SyllabusTopic[];
  variants?: SyllabusVariant[];
  sort_order?: number;
}): Promise<CourseSyllabusRow> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  return httpJson<CourseSyllabusRow>(`${apiBaseUrl()}/v1/admin/course-syllabuses/`, {
    method: 'POST',
    headers: authHeaders(token),
    body: payload,
    timeoutMs: 120000,
  });
}

export async function updateAdminCourseSyllabus(
  id: number,
  payload: Partial<{
    subject_name: string;
    description: string;
    instruction_language: AppLanguage;
    file_name: string;
    topics: SyllabusTopic[];
    variants: SyllabusVariant[];
    append_variants: boolean;
    sort_order: number;
    is_active: boolean;
  }>,
): Promise<CourseSyllabusRow> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  return httpJson<CourseSyllabusRow>(`${apiBaseUrl()}/v1/admin/course-syllabuses/${id}/`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: payload,
    timeoutMs: 120000,
  });
}

export async function deleteAdminCourseSyllabus(id: number): Promise<void> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  await httpJson<unknown>(`${apiBaseUrl()}/v1/admin/course-syllabuses/${id}/`, {
    method: 'DELETE',
    headers: authHeaders(token),
    timeoutMs: 20000,
  });
}

// ——— Admin: o'qituvchi-fan biriktiruvi ———

export async function fetchAdminStaffCourseSelections(
  syllabusId: number,
): Promise<AdminStaffCourseSelectionRow[]> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  const data = await httpJson<
    AdminStaffCourseSelectionRow[] | PagedResponse<AdminStaffCourseSelectionRow>
  >(`${apiBaseUrl()}/v1/admin/staff-course-selections/?syllabus_id=${syllabusId}`, {
    headers: authHeaders(token),
    timeoutMs: 20000,
  });
  return unwrapPagedResults(data);
}

/** Barcha o'qituvchi–fan biriktiruvlari (fan bo'yicha filtrsiz) */
export async function fetchAllStaffCourseSelections(): Promise<AdminStaffCourseSelectionRow[]> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  const data = await httpJson<
    AdminStaffCourseSelectionRow[] | PagedResponse<AdminStaffCourseSelectionRow>
  >(`${apiBaseUrl()}/v1/admin/staff-course-selections/?page_size=500`, {
    headers: authHeaders(token),
    timeoutMs: 30000,
  });
  return unwrapPagedResults(data);
}

export async function assignStaffToCourseSyllabus(
  phoneDigits: string,
  syllabusId: number,
  variantLabels: string[] = [],
): Promise<AdminStaffCourseSelectionRow[]> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  return httpJson<AdminStaffCourseSelectionRow[]>(`${apiBaseUrl()}/v1/admin/staff-course-selections/`, {
    method: 'POST',
    headers: authHeaders(token),
    body: { phone_digits: phoneDigits, syllabus_id: syllabusId, variant_labels: variantLabels },
    timeoutMs: 20000,
  });
}

export async function removeStaffCourseSelection(selectionId: number): Promise<void> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  await httpJson<unknown>(`${apiBaseUrl()}/v1/admin/staff-course-selections/${selectionId}/`, {
    method: 'DELETE',
    headers: authHeaders(token),
    timeoutMs: 20000,
  });
}

// ——— Hodim: katalog va tanlov ———

export async function fetchCourseSyllabusCatalog(): Promise<CourseSyllabusRow[]> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  const data = await httpJson<CourseSyllabusRow[] | PagedResponse<CourseSyllabusRow>>(
    `${apiBaseUrl()}/v1/course-syllabuses/catalog/?page_size=1000`,
    {
      headers: authHeaders(token),
      timeoutMs: 60000,
    },
  );
  return unwrapPagedResults(data);
}

export async function fetchMyCourseSelections(): Promise<StaffCourseSelectionRow[]> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  const rows = await httpJson<StaffCourseSelectionRow[]>(`${apiBaseUrl()}/v1/course-syllabuses/my/`, {
    headers: authHeaders(token),
    timeoutMs: 30000,
  });
  return Array.isArray(rows) ? rows : [];
}

export async function selectCourseSyllabus(syllabusId: number): Promise<StaffCourseSelectionRow> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  return httpJson<StaffCourseSelectionRow>(`${apiBaseUrl()}/v1/course-syllabuses/my/`, {
    method: 'POST',
    headers: authHeaders(token),
    body: { syllabus_id: syllabusId },
    timeoutMs: 20000,
  });
}

export async function unselectCourseSyllabus(syllabusId: number): Promise<void> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  await httpJson<unknown>(`${apiBaseUrl()}/v1/course-syllabuses/my/${syllabusId}/`, {
    method: 'DELETE',
    headers: authHeaders(token),
    timeoutMs: 20000,
  });
}

export function isSyncUnavailable(err: unknown): boolean {
  if (err instanceof HttpError && (err.status === 401 || err.status === 403)) return true;
  return false;
}
