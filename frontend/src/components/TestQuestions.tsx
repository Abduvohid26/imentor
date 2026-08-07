import React, { useState, useEffect, useContext, useMemo, useRef } from 'react';
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  Brain,
  Copy,
  Users,
  Send,
  Download,
  KeyRound,
  Lock,
  ArrowLeft,
} from 'lucide-react';
import { motion } from 'motion/react';
import { aiService, TestSession, TestQuestion } from '../services/aiService';
import { AppLanguageContext, GlobalTopicContext } from '../App';
import type { AppLanguage } from '../i18n/language';
import { useUiText } from '../i18n/useUiText';
import { getCurrentLocalUser, normalizeUserRole } from '../utils/localStaffAuth';
import { getBackendAccessToken, loginStudentWithOnlineTest } from '../utils/backendAuth';
import {
  listPreparedForTopicSynced,
  loadLatestPreparedContent,
  loadPreparedByIdSynced,
  savePreparedContent,
  normTopicKey,
  type PreparedContentSummary,
} from '../utils/preparedContentStore';
import { buildPreparedContentMeta } from '../utils/preparedContentMeta';
import ContentTopicToolbar, { StaffToolbarButton } from './staff/ContentTopicToolbar';
import StaffPageLayout from './staff/StaffPageLayout';
import StaffErrorAlert from './staff/StaffErrorAlert';
import StaffLoading from './staff/StaffLoading';
import StaffPanel from './staff/StaffPanel';
import { isTopicContextComplete } from '../utils/syllabusTopicContext';
import { STAFF_HEADING } from './staff/staffUi';
import { messageFromAiError } from '../utils/aiErrors';
import {
  syncLiveTestSessionToServer,
  fetchLiveTestSessionFromServer,
  submitLiveTestOnServer,
  fetchLiveTestSubmissionsFromServer,
  finalizeLiveTestSessionOnServer,
  upsertLiveTestDraftOnServer,
  getLiveTestParticipantKey,
  createLiveTestSessionOnServer,
  type StudentTestQuestion,
} from '../utils/liveTestApi';
import QRCode from 'qrcode';
import { LIVE_SESSION_PREFIX, LIVE_SUBMISSIONS_PREFIX } from '../utils/liveTestStorage';
import MedicalReferencesList from './staff/MedicalReferencesList';
import {
  downloadTestAnswerKeyPdf,
  downloadTestResultsPdf,
} from '../utils/buildTestPdf';
import { gradeBadgeClass, scoreToGrade } from '../utils/testGrading';

interface LiveTestSessionDoc {
  topic: string;
  questions: TestQuestion[] | StudentTestQuestion[];
  createdAt: number;
}

function stripQuestionsForStudentView(questions: TestQuestion[]): StudentTestQuestion[] {
  return questions.map((q) => {
    const item: StudentTestQuestion = {
      question: q.question,
      options: q.options,
    };
    if (q.references?.length) item.references = q.references;
    return item;
  });
}

function saveStudentSession(sessionId: string, data: LiveTestSessionDoc): void {
  const safe: LiveTestSessionDoc = {
    topic: data.topic,
    createdAt: data.createdAt,
    questions: stripQuestionsForStudentView(data.questions as TestQuestion[]),
  };
  localStorage.setItem(`${LOCAL_TEST_SESSION_PREFIX}${sessionId}`, JSON.stringify(safe));
}

interface TestSubmissionDoc {
  sessionId: string;
  firstName: string;
  lastName: string;
  answers: number[];
  submittedAt: number;
}

const LOCAL_TEST_SESSION_PREFIX = LIVE_SESSION_PREFIX;
const LOCAL_TEST_SUBMISSIONS_PREFIX = LIVE_SUBMISSIONS_PREFIX;
const TEACHER_SID_BY_TOPIC = 'imentor-teacher-live-sid-v1';

function teacherSidStorageKey(topic: string): string {
  return `${TEACHER_SID_BY_TOPIC}:${normTopicKey(topic)}`;
}

function readStoredTeacherSid(topic: string): string | null {
  try {
    return sessionStorage.getItem(teacherSidStorageKey(topic));
  } catch {
    return null;
  }
}

function writeStoredTeacherSid(topic: string, sid: string): void {
  try {
    sessionStorage.setItem(teacherSidStorageKey(topic), sid);
  } catch {
    /* ignore */
  }
}

function clearStoredTeacherSid(topic: string): void {
  try {
    sessionStorage.removeItem(teacherSidStorageKey(topic));
  } catch {
    /* ignore */
  }
}

/** Yopilgan test paneli teacher sahifasidan shuncha vaqtdan keyin avto yo'qoladi. */
const TEACHER_SESSION_AUTO_HIDE_MS = 60 * 60 * 1000;

function tryReuseTeacherSessionId(data: TestSession): string | null {
  const stored = readStoredTeacherSid(data.topic);
  if (!stored) return null;
  const doc = loadLocalSession(stored);
  if (!doc) return null;
  if (normTopicKey(doc.topic) !== normTopicKey(data.topic)) return null;
  if (doc.questions.length !== data.questions.length) return null;
  return stored;
}

function saveLocalSession(sessionId: string, data: LiveTestSessionDoc): void {
  localStorage.setItem(`${LOCAL_TEST_SESSION_PREFIX}${sessionId}`, JSON.stringify(data));
}

function loadLocalSession(sessionId: string): LiveTestSessionDoc | null {
  try {
    const raw = localStorage.getItem(`${LOCAL_TEST_SESSION_PREFIX}${sessionId}`);
    if (!raw) return null;
    return JSON.parse(raw) as LiveTestSessionDoc;
  } catch {
    return null;
  }
}

function loadLocalSubmissions(sessionId: string): TestSubmissionDoc[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_TEST_SUBMISSIONS_PREFIX}${sessionId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TestSubmissionDoc[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalSubmissions(sessionId: string, list: TestSubmissionDoc[]): void {
  localStorage.setItem(`${LOCAL_TEST_SUBMISSIONS_PREFIX}${sessionId}`, JSON.stringify(list));
}

export default function TestQuestions() {
  const globalTopic = useContext(GlobalTopicContext);
  const { language } = useContext(AppLanguageContext);
  const { t, locale } = useUiText();
  const queryParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const isStudentMode = queryParams.get('mode') === 'student';
  /** QR ba'zan `id=` bilan chiqishi mumkin — ikkalasini qabul qilamiz */
  const studentSessionId = (queryParams.get('sid') || queryParams.get('id') || '').trim();

  const [topic, setTopic] = useState(globalTopic ? globalTopic.title : '');
  const [questionCount, setQuestionCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [testSession, setTestSession] = useState<TestSession | null>(null);
  const [versions, setVersions] = useState<PreparedContentSummary[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [viewLang, setViewLang] = useState<AppLanguage>(language);

  useEffect(() => {
    setViewLang(language);
  }, [language]);

  const availableTestLangs = useMemo<AppLanguage[]>(() => {
    if (!testSession) return [];
    const primary = testSession.primaryLanguage || language;
    const langs: AppLanguage[] = ['uz', 'ru', 'en'];
    return langs.filter((l) => l === primary || Boolean(testSession.translations?.[l]));
  }, [testSession, language]);

  const displayedTest = useMemo(() => {
    if (!testSession) return null;
    const primary = testSession.primaryLanguage || language;
    if (viewLang === primary) return testSession;
    const translated = testSession.translations?.[viewLang];
    return translated ? { ...testSession, ...translated } : testSession;
  }, [testSession, viewLang, language]);

  const refreshVersions = React.useCallback(() => {
    const lookup = globalTopic ?? topic;
    if (!topic.trim() && !globalTopic) {
      setVersions([]);
      return;
    }
    void listPreparedForTopicSynced('test', lookup).then(setVersions);
  }, [topic, globalTopic]);

  useEffect(() => {
    if (globalTopic && !isStudentMode) {
      setTopic(globalTopic.title);
    }
  }, [globalTopic, isStudentMode]);

  const setupTeacherLiveSession = async (data: TestSession, reuseSid?: string): Promise<string> => {
    const questions: TestQuestion[] = data.questions;
    const doc: LiveTestSessionDoc = {
      topic: data.topic,
      questions,
      createdAt: Date.now(),
    };
    const sid =
      reuseSid ||
      (await createLiveTestSessionOnServer({
        topic: doc.topic,
        questions,
        createdAt: doc.createdAt,
      }));
    if (reuseSid) {
      await syncLiveTestSessionToServer(sid, {
        topic: doc.topic,
        questions,
        createdAt: doc.createdAt,
      });
    }
    saveLocalSession(sid, doc);
    saveLocalSubmissions(sid, []);
    setTeacherSessionId(sid);
    setSessionClosed(false);
    setClosedAtMs(null);
    setJoinUrl(
      `${window.location.origin}${window.location.pathname}?mode=student&sid=${encodeURIComponent(sid)}`
    );
    setSubmissions([]);
    setShowAnalysis(true);
    writeStoredTeacherSid(data.topic, sid);
    return sid;
  };

  const [error, setError] = useState<string | null>(null);
  const [teacherSessionId, setTeacherSessionId] = useState<string>('');
  const [joinUrl, setJoinUrl] = useState('');
  const [joinQrDataUrl, setJoinQrDataUrl] = useState('');
  const [submissions, setSubmissions] = useState<TestSubmissionDoc[]>([]);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [downloadingKeyPdf, setDownloadingKeyPdf] = useState(false);
  const [downloadingResultsPdf, setDownloadingResultsPdf] = useState(false);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [closedAtMs, setClosedAtMs] = useState<number | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  const [studentFirstName, setStudentFirstName] = useState('');
  const [studentLastName, setStudentLastName] = useState('');
  const [studentLoginId, setStudentLoginId] = useState('');
  const [studentLoginPassword, setStudentLoginPassword] = useState('');
  const [studentAuthLoading, setStudentAuthLoading] = useState(false);
  const [studentAuthed, setStudentAuthed] = useState(() => {
    const u = getCurrentLocalUser();
    return normalizeUserRole(u) === 'student';
  });
  const [studentAnswers, setStudentAnswers] = useState<number[]>([]);
  const [studentSubmitted, setStudentSubmitted] = useState(false);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentTest, setStudentTest] = useState<LiveTestSessionDoc | null>(null);

  const [sessionLoading, setSessionLoading] = useState(isStudentMode && !!studentSessionId);
  const serverSessionSyncedRef = useRef<string | null>(null);
  const participantKeyRef = useRef('');
  const enrichTokenRef = useRef<symbol | null>(null);

  const mapServerSubmissions = React.useCallback(
    (rows: Array<{ firstName: string; lastName: string; answers: number[]; submittedAt: number }>) =>
      rows.map((r) => ({
        sessionId: teacherSessionId,
        firstName: r.firstName,
        lastName: r.lastName,
        answers: r.answers,
        submittedAt: r.submittedAt,
      })),
    [teacherSessionId]
  );

  const refreshSessionClosedFromServer = React.useCallback(async (sessionKey: string) => {
    if (!sessionKey) return;
    try {
      const remote = await fetchLiveTestSessionFromServer(sessionKey);
      if (remote) {
        setSessionClosed(Boolean(remote.isClosed));
        setClosedAtMs(remote.closedAtMs ?? null);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!joinUrl) {
      setJoinQrDataUrl('');
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(joinUrl, { width: 420, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setJoinQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setJoinQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  useEffect(() => {
    if (!isStudentMode || !studentSessionId) {
      setSessionLoading(false);
      return;
    }
    let cancelled = false;
    setSessionLoading(true);
    setError(null);

    (async () => {
      participantKeyRef.current = getLiveTestParticipantKey(studentSessionId);

      const applyClosed = (closed: boolean) => {
        if (closed) {
          setSessionClosed(true);
          setError(t('test.sessionClosedStudentHint'));
        }
      };

      try {
        const remote = await fetchLiveTestSessionFromServer(studentSessionId);
        if (cancelled) return;
        if (remote?.isClosed) {
          applyClosed(true);
          setSessionLoading(false);
          return;
        }
        if (remote && remote.questions.length > 0) {
          const doc: LiveTestSessionDoc = {
            topic: remote.topic,
            questions: remote.questions,
            createdAt: remote.createdAt,
          };
          saveStudentSession(studentSessionId, doc);
          setStudentTest(doc);
          setStudentAnswers(new Array(doc.questions.length).fill(-1));
          setSessionLoading(false);
          void upsertLiveTestDraftOnServer(studentSessionId, {
            participantKey: participantKeyRef.current,
            firstName: '',
            lastName: '',
            answers: new Array(doc.questions.length).fill(-1),
          }).catch(() => {});
          return;
        }
      } catch {
        /* serverdan o'qib bo'lmasa local fallback */
      }

      const local = loadLocalSession(studentSessionId);
      if (local) {
        if (!cancelled) {
          const safe: LiveTestSessionDoc = {
            topic: local.topic,
            createdAt: local.createdAt,
            questions: stripQuestionsForStudentView(local.questions as TestQuestion[]),
          };
          setStudentTest(safe);
          setStudentAnswers(new Array(local.questions.length).fill(-1));
          setSessionLoading(false);
          void upsertLiveTestDraftOnServer(studentSessionId, {
            participantKey: participantKeyRef.current,
            firstName: '',
            lastName: '',
            answers: new Array(local.questions.length).fill(-1),
          }).catch(() => {});
        }
        return;
      }

      if (!cancelled) {
        setError(t('test.sessionNotFound'));
        setSessionLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isStudentMode, studentSessionId]);

  useEffect(() => {
    if (isStudentMode || !studentSessionId || !studentTest || studentSubmitted || sessionClosed) return;
    const timer = window.setTimeout(() => {
      void upsertLiveTestDraftOnServer(studentSessionId, {
        participantKey: participantKeyRef.current,
        firstName: studentFirstName,
        lastName: studentLastName,
        answers: studentAnswers,
      }).catch(() => {});
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    isStudentMode,
    studentSessionId,
    studentTest,
    studentSubmitted,
    sessionClosed,
    studentFirstName,
    studentLastName,
    studentAnswers,
  ]);

  useEffect(() => {
    if (isStudentMode || !teacherSessionId) return;
    void refreshSessionClosedFromServer(teacherSessionId);
  }, [isStudentMode, teacherSessionId, refreshSessionClosedFromServer]);

  /**
   * Yopilgan (finalize qilingan) test paneli teacher sahifasida 60 daqiqa
   * ko'rinib turadi (natijalarni tahlil qilish uchun), so'ng avto yo'qoladi —
   * sahifa "yangi test yaratish" boshlang'ich holatiga qaytadi.
   */
  useEffect(() => {
    if (isStudentMode || !sessionClosed || !closedAtMs) return;
    const elapsed = Date.now() - closedAtMs;
    const remaining = TEACHER_SESSION_AUTO_HIDE_MS - elapsed;
    const resetPanel = () => {
      clearStoredTeacherSid(topic);
      setTestSession(null);
      setTeacherSessionId('');
      setJoinUrl('');
      setSubmissions([]);
      setSessionClosed(false);
      setClosedAtMs(null);
      setActiveVersionId(null);
    };
    if (remaining <= 0) {
      resetPanel();
      return;
    }
    const timer = window.setTimeout(resetPanel, remaining);
    return () => window.clearTimeout(timer);
  }, [isStudentMode, sessionClosed, closedAtMs, topic]);

  useEffect(() => {
    refreshVersions();
  }, [refreshVersions]);

  useEffect(() => {
    if (isStudentMode || !topic.trim()) return;
    const lookup = globalTopic ?? topic;
    let mounted = true;
    (async () => {
      const prepared = await loadLatestPreparedContent<TestSession>('test', lookup);
      if (!mounted) return;
      const list = await listPreparedForTopicSynced('test', lookup);
      if (!mounted) return;
      setVersions(list);
      if (!prepared) {
        setTestSession(null);
        setTeacherSessionId('');
        setJoinUrl('');
        setActiveVersionId(null);
        return;
      }
      setTestSession(prepared);
      const reused = tryReuseTeacherSessionId(prepared);
      void setupTeacherLiveSession(prepared, reused ?? undefined);
      setActiveVersionId(list[0]?.id ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, [isStudentMode, topic, globalTopic, refreshVersions]);

  useEffect(() => {
    if (isStudentMode || !teacherSessionId || sessionClosed) return;

    const loadLocalNow = () => {
      const list = loadLocalSubmissions(teacherSessionId);
      list.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
      return list;
    };

    let cancelled = false;
    const ensureServerSession = async (): Promise<void> => {
      if (serverSessionSyncedRef.current === teacherSessionId) return;
      const localDoc = loadLocalSession(teacherSessionId);
      if (!localDoc) return;
      const ok = await syncLiveTestSessionToServer(teacherSessionId, {
        topic: localDoc.topic,
        questions: localDoc.questions as TestQuestion[],
        createdAt: localDoc.createdAt,
      });
      if (ok) serverSessionSyncedRef.current = teacherSessionId;
    };

    const tick = async () => {
      try {
        await ensureServerSession();
        const remote = await fetchLiveTestSubmissionsFromServer(teacherSessionId);
        if (cancelled) return;
        const mapped: TestSubmissionDoc[] = remote.map((r) => ({
          sessionId: teacherSessionId,
          firstName: r.firstName,
          lastName: r.lastName,
          answers: r.answers,
          submittedAt: r.submittedAt,
        }));
        setSubmissions(mapped.length > 0 ? mapped : loadLocalNow());
      } catch {
        if (!cancelled) setSubmissions(loadLocalNow());
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 4000);

    const onStorage = (e: StorageEvent) => {
      if (e.key === `${LOCAL_TEST_SUBMISSIONS_PREFIX}${teacherSessionId}`) {
        setSubmissions(loadLocalNow());
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('storage', onStorage);
    };
  }, [isStudentMode, teacherSessionId, sessionClosed]);

  const handleFinalizeSession = async (): Promise<boolean> => {
    if (!teacherSessionId || !testSession || sessionClosed) return Boolean(sessionClosed);
    setFinalizing(true);
    setError(null);
    try {
      const result = await finalizeLiveTestSessionOnServer(teacherSessionId);
      setSessionClosed(result.isClosed);
      setClosedAtMs(result.closedAtMs ?? Date.now());
      setSubmissions(mapServerSubmissions(result.submissions));
      return true;
    } catch (err) {
      console.error('Finalize error:', err);
      setError(t('test.errorFinalize'));
      return false;
    } finally {
      setFinalizing(false);
    }
  };

  const handleBackToQuestions = () => {
    setShowAnalysis(true);
  };

  /** Yagona, izchil joylashgan almashtirish tugmasi — avval bu tugma faqat
   * "Natijalarni ko'rish"ga o'tkazardi, orqaga qaytish esa natijalar
   * jadvali ICHIDAGI alohida kichik "Orqaga" tugmasi orqali bo'lardi —
   * ikkita boshqaruv ikki xil joyda bo'lgani foydalanuvchini
   * chalg'itardi ("UI qotib qolganday" tuyulishi shundan). Endi bitta
   * tugma ikkala yo'nalishda ham ishlaydi va holatga qarab yorlig'i
   * o'zgaradi. */
  const handleToggleResultsView = () => {
    setShowAnalysis((prev) => !prev);
  };

  useEffect(() => {
    serverSessionSyncedRef.current = null;
  }, [teacherSessionId]);

  const handleSelectVersion = (id: string) => {
    void (async () => {
      const data = await loadPreparedByIdSynced<TestSession>('test', id);
      if (!data) return;
      setTestSession(data);
      const reused = tryReuseTeacherSessionId(data);
      void setupTeacherLiveSession(data, reused ?? undefined);
      setActiveVersionId(id);
      setShowAnalysis(true);
      setError(null);
    })();
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!topic.trim()) return;

    // Test fanga bog'lanishi shart — fan/mavzu tanlanmagan bo'lsa yaratishga yo'l qo'ymaymiz
    if (!globalTopic?.subjectCode?.trim()) {
      setError(t('test.errorNoSubject'));
      return;
    }

    if (testSession && teacherSessionId) {
      const ok = window.confirm(t('test.regenerateConfirm'));
      if (!ok) return;
    }

    setLoading(true);
    setError(null);
    const enrichToken = Symbol('test-enrich');
    enrichTokenRef.current = enrichToken;
    try {
      const count = Math.min(30, Math.max(10, questionCount));
      // Asosiy til = UI tili (header dagi uz/ru/en). Qolgan 2 til — fonda tarjima.
      const contentLanguage = language;
      const data = await aiService.generateTests(topic, count, contentLanguage, globalTopic.subjectCode);
      setTestSession(data);
      setViewLang(data.primaryLanguage || contentLanguage);
      const sid = await setupTeacherLiveSession(data);
      if (!sid) throw new Error('live-session-missing');
      setLoading(false);

      void (async () => {
        const meta = buildPreparedContentMeta(globalTopic);
        try {
          // Fonda: qolgan 2 tilga tarjima + kitob manbalari → bazaga yozish
          const enriched = await aiService.enrichTestSession(
            data,
            contentLanguage,
            globalTopic.subjectCode,
          );
          if (enrichTokenRef.current !== enrichToken) return;
          setTestSession(enriched);
          await savePreparedContent('test', topic, enriched, meta);
          await setupTeacherLiveSession(enriched, sid);
        } catch (enrichErr) {
          console.warn('Test enrich failed — saving primary-language test as fallback', enrichErr);
          if (enrichTokenRef.current !== enrichToken) return;
          try {
            await savePreparedContent('test', topic, data, meta);
          } catch (saveErr) {
            console.warn('Fallback test save failed', saveErr);
          }
        }
        if (enrichTokenRef.current !== enrichToken) return;
        const nextList = await listPreparedForTopicSynced('test', globalTopic ?? topic);
        setVersions(nextList);
        setActiveVersionId(nextList[0]?.id ?? null);
      })();
    } catch (err) {
      console.error('Test generation error:', err);
      setError(messageFromAiError(err, t('test.errorGenerate'), language));
      setLoading(false);
    }
  };

  const handleStudentAnswer = (questionIndex: number, optionIndex: number) => {
    if (studentSubmitted) return;
    const next = [...studentAnswers];
    next[questionIndex] = optionIndex;
    setStudentAnswers(next);
  };

  const calculateScore = (answers: number[], questions: TestQuestion[]) => {
    return answers.filter((a, i) => a === questions[i].correctOptionIndex).length;
  };

  const handleDownloadKeyPdf = async () => {
    if (!testSession) return;
    setDownloadingKeyPdf(true);
    try {
      await downloadTestAnswerKeyPdf(testSession, language);
    } catch (err) {
      console.error('Answer key PDF error:', err);
      setError(t('test.errorPdf'));
    } finally {
      setDownloadingKeyPdf(false);
    }
  };

  const handleDownloadResultsPdf = async () => {
    if (!testSession || submissions.length === 0) return;
    setDownloadingResultsPdf(true);
    try {
      await downloadTestResultsPdf(
        testSession,
        submissions.map((s) => ({
          firstName: s.firstName,
          lastName: s.lastName,
          answers: s.answers,
          submittedAt: s.submittedAt,
        })),
        language,
      );
    } catch (err) {
      console.error('Results PDF error:', err);
      setError(t('test.errorPdf'));
    } finally {
      setDownloadingResultsPdf(false);
    }
  };

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!studentLoginId.trim() || !studentLoginPassword) {
      setError(t('test.studentLoginRequired'));
      return;
    }
    setStudentAuthLoading(true);
    try {
      const u = await loginStudentWithOnlineTest(studentLoginId.trim(), studentLoginPassword);
      setStudentFirstName(u.firstName || '');
      setStudentLastName(u.lastName || '');
      setStudentAuthed(true);
      setStudentLoginPassword('');
      await getBackendAccessToken();
    } catch (err) {
      console.error(err);
      const code = err instanceof Error ? err.message : '';
      setError(
        code === 'forbidden' ? t('test.studentLoginForbidden') : t('test.studentLoginError'),
      );
    } finally {
      setStudentAuthLoading(false);
    }
  };

  useEffect(() => {
    if (!isStudentMode || !studentAuthed) return;
    const u = getCurrentLocalUser();
    if (normalizeUserRole(u) !== 'student' || !u) return;
    if (!studentFirstName.trim() && u.firstName) setStudentFirstName(u.firstName);
    if (!studentLastName.trim() && u.lastName) setStudentLastName(u.lastName);
  }, [isStudentMode, studentAuthed, studentFirstName, studentLastName]);

  useEffect(() => {
    if (!studentSubmitted) return;
    const timer = window.setTimeout(() => {
      window.location.href = `${window.location.pathname}?view=my-tests`;
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [studentSubmitted]);

  const handleStudentSubmit = async () => {
    if (!studentTest || !studentSessionId) return;
    if (!studentAuthed) {
      setError(t('test.studentLoginRequired'));
      return;
    }
    if (!studentFirstName.trim() || !studentLastName.trim()) {
      setError(t('test.studentErrorName'));
      return;
    }
    if (studentAnswers.includes(-1)) {
      setError(t('test.studentErrorAllQuestions'));
      return;
    }
    setStudentLoading(true);
    setError(null);
    try {
      await submitLiveTestOnServer(studentSessionId, {
        participantKey: participantKeyRef.current,
        firstName: studentFirstName.trim(),
        lastName: studentLastName.trim(),
        answers: studentAnswers,
      });
      const item: TestSubmissionDoc = {
        sessionId: studentSessionId,
        firstName: studentFirstName.trim(),
        lastName: studentLastName.trim(),
        answers: studentAnswers,
        submittedAt: Date.now(),
      };
      const list = loadLocalSubmissions(studentSessionId);
      list.unshift(item);
      saveLocalSubmissions(studentSessionId, list);
      setStudentSubmitted(true);
    } catch (err) {
      console.error(err);
      setError(t('test.studentErrorSubmit'));
    } finally {
      setStudentLoading(false);
    }
  };

  if (isStudentMode) {
    return (
      <div className="h-full flex flex-col bg-[#f2f2f7] p-3 sm:p-5 lg:p-6 overflow-y-auto">
        <div className="w-full space-y-6 pb-20">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-gray-900">{t('test.studentTitle')}</h1>
            {/* Avval har doim (login bosqichida ham) "ism-familiyangizni kiriting"
                degan matn ko'rsatilardi — aslida bu bosqichda login talab
                qilinadi, ism-familiya keyingi qadamda so'raladi. Matn holatga
                mos bo'lishi uchun shartli qilindi. */}
            <p className="text-gray-500">
              {studentAuthed ? t('test.studentSubtitle') : t('test.studentLoginHint')}
            </p>
          </div>
          {!studentAuthed ? (
            <form
              onSubmit={handleStudentLogin}
              className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 space-y-4 max-w-md mx-auto w-full"
            >
              <div className="flex items-center gap-2 text-blue-700 font-semibold">
                <KeyRound size={20} />
                {t('test.studentLoginTitle')}
              </div>
              <input
                value={studentLoginId}
                onChange={(e) => setStudentLoginId(e.target.value)}
                placeholder={t('test.studentLoginId')}
                autoComplete="username"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-400"
              />
              <input
                type="password"
                value={studentLoginPassword}
                onChange={(e) => setStudentLoginPassword(e.target.value)}
                placeholder={t('test.studentLoginPassword')}
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-400"
              />
              {error && (
                <div className="bg-rose-50 text-rose-700 border border-rose-200 p-3 rounded-xl text-sm">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={studentAuthLoading}
                className="w-full h-12 bg-blue-600 text-white rounded-2xl font-semibold hover:bg-blue-500 flex items-center justify-center gap-2"
              >
                {studentAuthLoading ? <Loader2 size={18} className="animate-spin" /> : null}
                {t('test.studentLoginBtn')}
              </button>
            </form>
          ) : sessionLoading ? (
            <div className="bg-white rounded-3xl p-8 border border-gray-100 text-center">
              <Loader2 className="animate-spin text-blue-600 mx-auto mb-3" />
              <p className="text-gray-600">{t('test.studentLoading')}</p>
            </div>
          ) : error && !studentTest ? (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-3xl p-6 text-center font-medium">
              {error}
            </div>
          ) : sessionClosed ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-3xl p-8 text-center space-y-3">
              <Lock size={32} className="mx-auto text-amber-700" />
              <p className="font-bold text-lg">{t('test.sessionClosedStudent')}</p>
              <p className="text-sm text-amber-800/80">{t('test.sessionClosedStudentHint')}</p>
            </div>
          ) : studentTest ? (
            <>
              <div className="bg-white rounded-3xl p-6 border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800 mb-4">{studentTest.topic}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    value={studentFirstName}
                    onChange={(e) => setStudentFirstName(e.target.value)}
                    placeholder={t('test.studentFirstName')}
                    disabled={studentSubmitted || sessionClosed}
                    className="px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <input
                    value={studentLastName}
                    onChange={(e) => setStudentLastName(e.target.value)}
                    placeholder={t('test.studentLastName')}
                    disabled={studentSubmitted || sessionClosed}
                    className="px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>

              <div className="space-y-6">
                {studentTest.questions.map((q, i) => (
                  <div key={i} className="bg-white rounded-3xl p-6 border border-gray-100">
                    <p className="font-bold text-gray-800 mb-4">{i + 1}. {q.question}</p>
                    <div className="space-y-2">
                      {q.options.map((opt, optIdx) => (
                        <button
                          key={optIdx}
                          onClick={() => handleStudentAnswer(i, optIdx)}
                          disabled={studentSubmitted || sessionClosed}
                          className={`w-full text-left p-3 rounded-xl border ${
                            studentAnswers[i] === optIdx ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {String.fromCharCode(65 + optIdx)}) {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {!studentSubmitted && !sessionClosed ? (
                <button
                  onClick={handleStudentSubmit}
                  disabled={studentLoading}
                  className="w-full h-12 bg-blue-600 text-white rounded-2xl font-semibold hover:bg-blue-500 flex items-center justify-center gap-2"
                >
                  {studentLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  {t('test.studentSubmit')}
                </button>
              ) : studentSubmitted ? (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-xl space-y-3">
                  <p className="font-semibold">{t('test.studentSuccess')}</p>
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = `${window.location.pathname}?view=my-tests`;
                    }}
                    className="w-full h-11 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500"
                  >
                    {t('student.myTestsTitle')}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
          {error && studentTest && (
            <div className="bg-rose-50 text-rose-700 border border-rose-200 p-3 rounded-xl">{error}</div>
          )}
        </div>
      </div>
    );
  }

  const staffTopic =
    globalTopic && isTopicContextComplete(globalTopic) ? globalTopic : null;

  return (
    <StaffPageLayout spacious>
      <ContentTopicToolbar
        moduleLabel={t('test.teacherBadge', { count: questionCount })}
        topic={staffTopic}
        topicValue={topic}
        onTopicChange={setTopic}
        topicLabel={t('test.topicLabel')}
        topicPlaceholder={t('test.topicPlaceholder')}
        createLabel={t('test.create', { count: questionCount })}
        loading={loading}
        onCreate={() => void handleGenerate()}
        lockTopicFromSyllabus={Boolean(staffTopic)}
        hint={t('test.heroSubtitle')}
        questionCount={questionCount}
        onQuestionCountChange={setQuestionCount}
        questionCountMin={10}
        questionCountMax={30}
        versions={versions}
        activeVersionId={activeVersionId}
        onSelectVersion={handleSelectVersion}
        versionsTitle={t('test.savedVersions')}
      />

      {error && <StaffErrorAlert message={error} />}
      {loading && (
        <StaffLoading
          label={t('test.generating')}
          hint={t('test.generatingHint', { count: questionCount })}
        />
      )}

        {testSession && displayedTest && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <StaffPanel className="p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <h2 className={`text-xl font-bold ${STAFF_HEADING}`}>{displayedTest.topic}</h2>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {availableTestLangs.length > 1 && (
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
                      {availableTestLangs.map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setViewLang(l)}
                          className={`px-3 py-1.5 text-xs font-semibold uppercase ${
                            viewLang === l ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                  <StaffToolbarButton onClick={() => void handleDownloadKeyPdf()} disabled={downloadingKeyPdf}>
                    {downloadingKeyPdf ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                    {t('test.downloadKeyPdf')}
                  </StaffToolbarButton>
                  <StaffToolbarButton
                    onClick={() => void handleDownloadResultsPdf()}
                    disabled={downloadingResultsPdf || submissions.length === 0}
                  >
                    {downloadingResultsPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    {t('test.downloadResultsPdf')} ({submissions.length})
                  </StaffToolbarButton>
                </div>
              </div>

              {sessionClosed && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
                  <Lock size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">{t('test.sessionClosedTeacher')}</p>
                    <p className="text-sm text-amber-800/85 mt-1">{t('test.sessionClosedTeacherHint')}</p>
                  </div>
                </div>
              )}

              {joinUrl && !sessionClosed && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                  <div className="lg:col-span-1 flex justify-center">
                    <div className="bg-white border-4 border-blue-200 rounded-2xl p-4 shadow-md">
                      {joinQrDataUrl ? (
                        <img
                          src={joinQrDataUrl}
                          alt="Student test QR"
                          className="w-72 h-72 sm:w-80 sm:h-80 object-contain"
                        />
                      ) : (
                        <div className="w-72 h-72 sm:w-80 sm:h-80 flex items-center justify-center text-sm text-gray-500">
                          QR…
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="lg:col-span-2 space-y-3">
                    <p className="text-sm text-gray-600">
                      {t('test.qrInstructions')}
                    </p>
                    <div className="flex gap-2">
                      <input
                        value={joinUrl}
                        readOnly
                        className="flex-1 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-xs"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(joinUrl);
                        }}
                        className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold flex items-center gap-2"
                      >
                        <Copy size={16} /> {t('common.link')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {(joinUrl || teacherSessionId) && (
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleToggleResultsView}
                    className={`px-4 py-2 rounded-xl font-semibold ${!showAnalysis ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    {!showAnalysis ? (
                      <Brain size={16} className="inline mr-1" />
                    ) : (
                      <Users size={16} className="inline mr-1" />
                    )}
                    {!showAnalysis ? t('test.viewAnalysis') : t('test.viewResults')}
                  </button>
                  {!sessionClosed && (
                    <button
                      type="button"
                      onClick={() => void handleFinalizeSession()}
                      disabled={finalizing}
                      className="px-4 py-2 rounded-xl font-semibold bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
                    >
                      {finalizing ? <Loader2 size={16} className="inline mr-1 animate-spin" /> : <Lock size={16} className="inline mr-1" />}
                      {t('test.finalizeSession')}
                    </button>
                  )}
                </div>
              )}
            </StaffPanel>

            {!showAnalysis ? (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50 font-semibold text-gray-700 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={handleBackToQuestions}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      <ArrowLeft size={16} />
                      {t('test.backToQuestions')}
                    </button>
                    <span>{t('test.resultsTitle')} ({submissions.length})</span>
                  </div>
                  {sessionClosed && (
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                      {t('test.sessionFinalized')}
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="px-4 py-3">{t('test.studentColumn')}</th>
                        <th className="px-4 py-3">{t('test.scoreColumn')}</th>
                        <th className="px-4 py-3">{t('test.gradeColumn')}</th>
                        <th className="px-4 py-3">{t('test.timeColumn')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.map((s, idx) => {
                        const score = calculateScore(s.answers, testSession.questions);
                        const total = testSession.questions.length;
                        const grade = scoreToGrade(score, total);
                        return (
                        <tr key={idx} className="border-b last:border-b-0">
                          <td className="px-4 py-3 font-medium">{s.firstName} {s.lastName}</td>
                          <td className="px-4 py-3">
                            {score} / {total}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center justify-center min-w-[2rem] px-2.5 py-1 rounded-lg border text-sm font-bold ${gradeBadgeClass(grade)}`}>
                              {grade}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {new Date(s.submittedAt).toLocaleString(locale)}
                          </td>
                        </tr>
                        );
                      })}
                      {submissions.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                            {t('test.noSubmissionsRow')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {displayedTest.questions.map((q, i) => (
                  <div key={i} className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100">
                    <div className="flex items-start gap-4 mb-6">
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg shrink-0">
                        {i + 1}
                      </div>
                      <p className="text-lg text-gray-800 font-bold leading-relaxed">{q.question}</p>
                    </div>
                    <div className="space-y-2">
                      {q.options.map((option, optIdx) => {
                        const optionExplanation = q.optionExplanations?.[optIdx]?.trim();
                        return (
                          <div
                            key={optIdx}
                            className={`p-3 rounded-xl border ${
                              optIdx === q.correctOptionIndex
                                ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                                : 'border-gray-200 bg-white text-gray-700'
                            }`}
                          >
                            <div>
                              {String.fromCharCode(65 + optIdx)}) {option}
                              {optIdx === q.correctOptionIndex && (
                                <span className="ml-2 inline-flex items-center text-xs font-semibold">
                                  <CheckCircle2 size={14} className="mr-1" /> {t('test.correctAnswer')}
                                </span>
                              )}
                            </div>
                            {optionExplanation && (
                              <p className="mt-1 text-sm opacity-80">{optionExplanation}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
                      <h4 className="font-semibold text-blue-800 mb-1 flex items-center gap-2">
                        <Brain size={16} /> {t('test.correctAnalysis')}
                      </h4>
                      <p className="text-blue-800/90 whitespace-pre-wrap">{q.explanation}</p>
                      {q.references && q.references.length > 0 && (
                        <MedicalReferencesList
                          references={q.references}
                          title={t('test.questionReferences')}
                          compact
                        />
                      )}
                    </div>
                  </div>
                ))}
                {displayedTest.references && displayedTest.references.length > 0 && (
                  <MedicalReferencesList references={displayedTest.references} />
                )}
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-3 pt-2">
              {sessionClosed ? (
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={loading}
                  className="px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  {t('test.createNewAfterClose')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={loading}
                  className="px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  {t('test.createAnother')}
                </button>
              )}
            </div>
          </motion.div>
        )}
    </StaffPageLayout>
  );
}
