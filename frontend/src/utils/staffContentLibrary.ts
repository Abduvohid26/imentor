/**
 * Hodimlar yaratgan keys va testlar markaziy bazaga yoziladi (localStorage).
 * Administrator bu yozuvlarni ko‘rishi va o‘chirishi mumkin.
 */
import type { CaseStudySession, TestSession } from '../services/aiService';
import { LIVE_SESSION_PREFIX, LIVE_SUBMISSIONS_PREFIX } from './liveTestStorage';

const CASES_KEY = 'salomatlik-library-cases-v1';
const TESTS_KEY = 'salomatlik-library-tests-v1';

export { LIVE_SESSION_PREFIX, LIVE_SUBMISSIONS_PREFIX };

export interface CaseLibraryRecord {
  id: string;
  createdAt: number;
  authorUid: string;
  authorName: string;
  session: CaseStudySession;
}

export interface TestLibraryRecord {
  id: string;
  createdAt: number;
  authorUid: string;
  authorName: string;
  /** Jonli test sessiyasi (talaba havolasi) */
  liveSessionId: string;
  testSession: TestSession;
}

function readCases(): CaseLibraryRecord[] {
  try {
    const raw = localStorage.getItem(CASES_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as CaseLibraryRecord[];
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function writeCases(list: CaseLibraryRecord[]): void {
  localStorage.setItem(CASES_KEY, JSON.stringify(list.slice(0, 200)));
}

function readTests(): TestLibraryRecord[] {
  try {
    const raw = localStorage.getItem(TESTS_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as TestLibraryRecord[];
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function writeTests(list: TestLibraryRecord[]): void {
  localStorage.setItem(TESTS_KEY, JSON.stringify(list.slice(0, 200)));
}

export function appendCaseStudyToLibrary(params: {
  authorUid: string;
  authorName: string;
  session: CaseStudySession;
}): CaseLibraryRecord {
  const rec: CaseLibraryRecord = {
    id: `case_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    authorUid: params.authorUid,
    authorName: params.authorName,
    session: params.session,
  };
  writeCases([rec, ...readCases()]);
  return rec;
}

export function listCaseStudiesLibrary(): CaseLibraryRecord[] {
  return readCases().sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteCaseStudyRecord(id: string): void {
  writeCases(readCases().filter((r) => r.id !== id));
}

export function appendTestToLibrary(params: {
  authorUid: string;
  authorName: string;
  liveSessionId: string;
  testSession: TestSession;
}): TestLibraryRecord {
  const rec: TestLibraryRecord = {
    id: `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    authorUid: params.authorUid,
    authorName: params.authorName,
    liveSessionId: params.liveSessionId,
    testSession: { ...params.testSession, createdAt: Date.now(), authorUid: params.authorUid },
  };
  writeTests([rec, ...readTests()]);
  return rec;
}

export function listTestsLibrary(): TestLibraryRecord[] {
  return readTests().sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteTestRecord(id: string): void {
  const list = readTests();
  const rec = list.find((r) => r.id === id);
  if (rec) {
    try {
      localStorage.removeItem(`${LIVE_SESSION_PREFIX}${rec.liveSessionId}`);
      localStorage.removeItem(`${LIVE_SUBMISSIONS_PREFIX}${rec.liveSessionId}`);
    } catch {
      /* ignore */
    }
  }
  writeTests(list.filter((r) => r.id !== id));
}

export function getContentLibraryCounts(): { cases: number; tests: number } {
  return { cases: readCases().length, tests: readTests().length };
}
