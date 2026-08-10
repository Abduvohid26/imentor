import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  RefreshCw,
  Loader2,
  ArrowLeft,
  Search,
  GraduationCap,
  Users,
  UserSearch,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  X,
} from 'lucide-react';
import {
  fetchAdminLiveTestStats,
  fetchAdminLiveTestSessions,
  fetchAdminLiveTestSubmissions,
  fetchStudentLiveTestReport,
  type AdminLiveTestStatRow,
  type AdminLiveTestSessionRow,
  type AdminLiveTestSubmissionRow,
  type StudentLiveTestReport,
  type StudentReportSubjectRow,
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

function StudentSubjectCard({ subject }: { subject: StudentReportSubjectRow }) {
  const { t } = useUiText();
  const [open, setOpen] = useState(false);
  const label =
    subject.subjectName ||
    (subject.subjectCode === '__unassigned__' ? t('admin.liveTestUnassignedSubject') : subject.subjectCode);
  const missed = subject.totalSessions - subject.takenSessions;

  return (
    <div className="ios-glass rounded-2xl border border-white/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-white/40 transition-colors"
      >
        {open ? (
          <ChevronDown size={16} className="text-black/40 shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-black/40 shrink-0" />
        )}
        <GraduationCap size={16} className="text-indigo-600 shrink-0" />
        <span className="font-bold text-black/90 truncate flex-1">{label}</span>
        <span className="shrink-0 text-[12px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
          {t('admin.studentReportSolved')} {subject.takenSessions}
        </span>
        {missed > 0 && (
          <span className="shrink-0 text-[12px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
            {t('admin.studentReportMissed')} {missed}
          </span>
        )}
        {subject.avgScorePct != null && (
          <span
            className={`shrink-0 text-[12px] font-bold px-2 py-0.5 rounded-full ${
              subject.avgScorePct >= 60 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            {t('admin.liveTestAvgScore')} {subject.avgScorePct}%
          </span>
        )}
      </button>

      {open && (
        <ul className="border-t border-black/5 divide-y divide-black/5">
          {subject.sessions.map((row) => {
            const pct = row.taken && row.total > 0 ? Math.round(((row.score ?? 0) / row.total) * 100) : null;
            const wrong = row.taken ? Math.max(0, row.total - (row.score ?? 0)) : 0;
            return (
              <li
                key={row.sessionKey}
                className={`flex items-center gap-3 px-4 py-3 ${row.taken ? '' : 'bg-rose-50/40'}`}
              >
                {row.taken ? (
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                ) : (
                  <XCircle size={16} className="text-rose-500 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-black/85 truncate">{row.topic || '—'}</p>
                  <p className="text-[11px] text-black/45 mt-0.5">
                    {formatWhen(row.createdAtMs)} · {row.questionCount} {t('admin.studentReportQuestions')}
                  </p>
                </div>
                {row.taken ? (
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-emerald-700">
                      ✓ {row.score ?? 0}
                    </span>
                    <span className="text-[11px] font-semibold text-rose-600">✕ {wrong}</span>
                    <span
                      className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${
                        pct !== null && pct >= 60 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {row.score ?? 0}/{row.total}
                      {pct !== null ? ` (${pct}%)` : ''}
                    </span>
                  </div>
                ) : (
                  <span className="shrink-0 text-[12px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                    {t('admin.studentReportNotSolved')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
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

  // Talaba ID bo'yicha qidiruv — fanlar ro'yxati o'rniga bitta talaba hisoboti.
  const [studentIdQuery, setStudentIdQuery] = useState('');
  const [report, setReport] = useState<StudentLiveTestReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

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

  const searchStudent = useCallback(async () => {
    const id = studentIdQuery.trim();
    if (!id) return;
    setReportLoading(true);
    setError(null);
    try {
      setReport(await fetchStudentLiveTestReport(id));
    } catch {
      setReport(null);
      setError(t('admin.error.loadFailed'));
    } finally {
      setReportLoading(false);
    }
  }, [studentIdQuery, t]);

  const clearStudent = () => {
    setStudentIdQuery('');
    setReport(null);
    setError(null);
  };

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
    if (report) void searchStudent();
    else if (level === 'subjects') void loadSubjects();
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

  const subjectLabel = (row: AdminLiveTestStatRow) =>
    row.subjectName || (row.subjectCode === '__unassigned__' ? t('admin.liveTestUnassignedSubject') : row.subjectCode);

  const headerTitle =
    level === 'subjects'
      ? t('admin.liveTestResultsTab')
      : level === 'sessions'
        ? (selectedSubject ? subjectLabel(selectedSubject) : '')
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
                {level === 'sessions' ? t('admin.liveTestResultsTab') : (selectedSubject ? subjectLabel(selectedSubject) : t('admin.backToSessions'))}
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

      {/* Talaba ID bo'yicha qidiruv — fanlar darajasida doim ko'rinadi. */}
      {level === 'subjects' && (
        <div className="ios-glass rounded-2xl border border-white/60 p-4 space-y-2">
          <p className="text-[12px] font-semibold text-black/60 flex items-center gap-1.5">
            <UserSearch size={14} className="text-violet-600" />
            {t('admin.studentReportSearchTitle')}
          </p>
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={studentIdQuery}
                onChange={(e) => setStudentIdQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void searchStudent();
                }}
                placeholder={t('admin.studentReportSearchPlaceholder')}
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-[13px]"
              />
            </div>
            <button
              type="button"
              onClick={() => void searchStudent()}
              disabled={!studentIdQuery.trim() || reportLoading}
              className="inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-violet-600 text-white text-[13px] font-semibold disabled:opacity-40"
            >
              {reportLoading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              {t('admin.studentReportSearchAction')}
            </button>
            {report && (
              <button
                type="button"
                onClick={clearStudent}
                className="inline-flex items-center gap-1.5 px-3 h-10 rounded-xl border border-black/10 bg-white text-[13px] font-semibold text-black/60"
              >
                <X size={15} />
                {t('admin.studentReportClear')}
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-[13px] text-rose-600 font-medium">{error}</p>}

      {reportLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-violet-600" size={40} />
        </div>
      ) : report ? (
        !report.found ? (
          <div className="ios-glass rounded-2xl border p-10 text-center text-black/45 text-[14px]">
            {t('admin.studentReportNotFound', { id: report.studentId })}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="ios-glass rounded-2xl border border-white/60 p-4 flex items-center gap-3 flex-wrap">
              <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0">
                <UserSearch size={20} />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-black/90 truncate">
                  {`${report.firstName} ${report.lastName}`.trim() || report.studentId}
                </p>
                <p className="text-[12px] text-black/45">ID: {report.studentId}</p>
              </div>
              <div className="ml-auto flex items-center gap-2 text-[12px] flex-wrap">
                <span className="font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                  {t('admin.studentReportSolved')}{' '}
                  {report.subjects.reduce((n, x) => n + x.takenSessions, 0)}
                </span>
                <span className="font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full">
                  {t('admin.studentReportMissed')}{' '}
                  {report.subjects.reduce((n, x) => n + (x.totalSessions - x.takenSessions), 0)}
                </span>
              </div>
            </div>
            {report.subjects.map((sub) => (
              <StudentSubjectCard key={sub.subjectCode} subject={sub} />
            ))}
          </div>
        )
      ) : loading ? (
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
                  <span className="font-bold text-black/90 truncate">{subjectLabel(s)}</span>
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
