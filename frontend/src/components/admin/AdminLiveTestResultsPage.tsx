import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, RefreshCw, Loader2, ArrowLeft, Search, GraduationCap, Users } from 'lucide-react';
import {
  fetchAdminLiveTestStats,
  fetchAdminLiveTestSessions,
  fetchAdminLiveTestSubmissions,
  type AdminLiveTestStatRow,
  type AdminLiveTestSessionRow,
  type AdminLiveTestSubmissionRow,
} from '../../utils/liveTestApi';
import { useUiText } from '../../i18n/useUiText';

function formatWhen(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '—';
  }
}

type Level = 'subjects' | 'sessions' | 'submissions';

export default function AdminLiveTestResultsPage() {
  const { t } = useUiText();
  const [level, setLevel] = useState<Level>('subjects');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [subjects, setSubjects] = useState<AdminLiveTestStatRow[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<AdminLiveTestStatRow | null>(null);

  const [sessions, setSessions] = useState<AdminLiveTestSessionRow[]>([]);
  const [selectedSession, setSelectedSession] = useState<AdminLiveTestSessionRow | null>(null);

  const [submissions, setSubmissions] = useState<AdminLiveTestSubmissionRow[]>([]);
  const [studentSearch, setStudentSearch] = useState('');

  const loadSubjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSubjects(await fetchAdminLiveTestStats());
    } catch {
      setError(t('admin.error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadSessions = useCallback(
    async (subjectCode: string) => {
      setLoading(true);
      setError(null);
      try {
        setSessions(await fetchAdminLiveTestSessions(subjectCode));
      } catch {
        setError(t('admin.error.loadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  const loadSubmissions = useCallback(
    async (sessionKey: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchAdminLiveTestSubmissions({ sessionKey, pageSize: 200 });
        setSubmissions(res.results);
      } catch {
        setError(t('admin.error.loadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadSubjects();
  }, [loadSubjects]);

  const openSubject = (s: AdminLiveTestStatRow) => {
    setSelectedSubject(s);
    setLevel('sessions');
    void loadSessions(s.subjectCode);
  };

  const openSession = (s: AdminLiveTestSessionRow) => {
    setSelectedSession(s);
    setStudentSearch('');
    setLevel('submissions');
    void loadSubmissions(s.sessionKey);
  };

  const backToSubjects = () => {
    setLevel('subjects');
    setSelectedSubject(null);
    setSessions([]);
  };

  const backToSessions = () => {
    setLevel('sessions');
    setSelectedSession(null);
    setSubmissions([]);
  };

  const refresh = () => {
    if (level === 'subjects') void loadSubjects();
    else if (level === 'sessions' && selectedSubject) void loadSessions(selectedSubject.subjectCode);
    else if (level === 'submissions' && selectedSession) void loadSubmissions(selectedSession.sessionKey);
  };

  const filteredSubmissions = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return submissions;
    return submissions.filter(
      (s) =>
        s.studentId.toLowerCase().includes(q) ||
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(q),
    );
  }, [submissions, studentSearch]);

  const headerTitle =
    level === 'subjects'
      ? t('admin.liveTestResultsTab')
      : level === 'sessions'
        ? selectedSubject?.subjectName || selectedSubject?.subjectCode || ''
        : selectedSession?.topic || '';

  const headerSubtitle =
    level === 'subjects'
      ? t('admin.liveTestResultsSubtitle')
      : level === 'sessions'
        ? t('admin.liveTestSessionsSubtitle')
        : formatWhen(selectedSession?.createdAtMs ?? 0);

  return (
    <div className="w-full space-y-6 pb-16 px-3 sm:px-5 lg:px-6 py-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-violet-600 text-white flex items-center justify-center shrink-0">
            <ClipboardList size={24} />
          </div>
          <div className="min-w-0">
            {level !== 'subjects' && (
              <button
                type="button"
                onClick={level === 'sessions' ? backToSubjects : backToSessions}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-indigo-600 hover:text-indigo-700 mb-0.5"
              >
                <ArrowLeft size={13} />
                {level === 'sessions' ? t('admin.liveTestResultsTab') : selectedSubject?.subjectName || t('admin.backToSessions')}
              </button>
            )}
            <h1 className="text-xl font-bold text-black/90 truncate">{headerTitle}</h1>
            <p className="text-[12px] text-black/50 truncate">{headerSubtitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-black/10 bg-white text-[13px] font-semibold shrink-0"
        >
          <RefreshCw size={16} /> {t('admin.refresh')}
        </button>
      </div>

      {error && <p className="text-[13px] text-rose-600 font-medium">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-indigo-600" size={40} />
        </div>
      ) : level === 'subjects' ? (
        subjects.length === 0 ? (
          <div className="ios-glass rounded-2xl border p-10 text-center text-black/45 text-[14px]">
            {t('admin.noResults')}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((s) => (
              <button
                key={s.subjectCode}
                type="button"
                onClick={() => openSubject(s)}
                className="text-left ios-glass rounded-2xl border border-white/60 p-4 hover:border-indigo-300 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-2 mb-2">
                  <GraduationCap size={16} className="text-indigo-600 shrink-0" />
                  <span className="font-bold text-black/90 truncate">{s.subjectName || s.subjectCode}</span>
                </div>
                {s.department && <p className="text-[11px] text-black/40 mb-2">{s.department}</p>}
                <div className="flex items-center gap-3 text-[12px] text-black/60">
                  <span className="inline-flex items-center gap-1">
                    <ClipboardList size={12} /> {s.submissionCount} {t('admin.liveTestResultsCount')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users size={12} /> {s.studentCount} {t('admin.dashboardLiveTestStudents')}
                  </span>
                </div>
                {s.avgScorePct != null && (
                  <span
                    className={`inline-block mt-2 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      s.avgScorePct >= 60 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {t('admin.liveTestAvgScore')} {s.avgScorePct}%
                  </span>
                )}
              </button>
            ))}
          </div>
        )
      ) : level === 'sessions' ? (
        sessions.length === 0 ? (
          <div className="ios-glass rounded-2xl border p-10 text-center text-black/45 text-[14px]">
            {t('admin.noResults')}
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((sess) => (
              <button
                key={sess.sessionKey}
                type="button"
                onClick={() => openSession(sess)}
                className="w-full text-left ios-glass rounded-2xl border border-white/60 p-4 flex items-center justify-between gap-3 hover:border-indigo-300 hover:shadow-md transition-all"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-black/90 truncate">{sess.topic || '—'}</p>
                  <p className="text-[12px] text-black/45 mt-1">{formatWhen(sess.createdAtMs)}</p>
                </div>
                <span className="shrink-0 text-[12px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full">
                  {sess.submissionCount} {t('admin.dashboardLiveTestStudents')}
                </span>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder={t('admin.liveTestSearchStudent')}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-[13px]"
            />
          </div>
          {filteredSubmissions.length === 0 ? (
            <div className="ios-glass rounded-2xl border p-10 text-center text-black/45 text-[14px]">
              {t('admin.noResults')}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSubmissions.map((row) => {
                const pct = row.total > 0 ? Math.round((row.score / row.total) * 100) : null;
                return (
                  <div
                    key={row.id}
                    className="ios-glass rounded-2xl border border-white/60 p-4 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-black/90 truncate">
                        {row.firstName} {row.lastName}
                      </p>
                      <p className="text-[12px] text-black/45 mt-0.5">
                        {row.studentId ? `ID: ${row.studentId} · ` : ''}
                        {formatWhen(row.submittedAt)}
                      </p>
                    </div>
                    {row.total > 0 && (
                      <span
                        className={`shrink-0 text-sm font-bold px-2.5 py-1 rounded-full ${
                          pct !== null && pct >= 60 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {row.score}/{row.total}
                        {pct !== null ? ` (${pct}%)` : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
