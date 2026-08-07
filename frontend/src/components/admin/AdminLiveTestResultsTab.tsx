import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  fetchAdminLiveTestSubmissions,
  fetchAdminLiveTestStats,
  type AdminLiveTestSubmissionRow,
  type AdminLiveTestStatRow,
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

export default function AdminLiveTestResultsTab() {
  const { t } = useUiText();
  const [rows, setRows] = useState<AdminLiveTestSubmissionRow[]>([]);
  const [subjects, setSubjects] = useState<AdminLiveTestStatRow[]>([]);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subs, stats] = await Promise.all([
        fetchAdminLiveTestSubmissions({ subjectCode: subjectFilter || undefined, page }),
        subjects.length ? Promise.resolve(subjects) : fetchAdminLiveTestStats(),
      ]);
      setRows(subs.results);
      setCount(subs.count);
      setPageSize(subs.pageSize);
      if (!subjects.length) setSubjects(stats);
    } catch {
      setError(t('admin.error.loadFailed'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectFilter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / Math.max(1, pageSize))), [count, pageSize]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={subjectFilter}
          onChange={(e) => {
            setSubjectFilter(e.target.value);
            setPage(1);
          }}
          className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13px]"
        >
          <option value="">{t('admin.filterAllSubjects')}</option>
          {subjects.map((s) => (
            <option key={s.subjectCode} value={s.subjectCode}>
              {s.subjectName || s.subjectCode}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-black/45 font-medium">
          {count} {t('admin.liveTestResultsCount')}
        </span>
      </div>

      {error && <p className="text-[13px] text-rose-600 font-medium">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-indigo-600" size={40} />
        </div>
      ) : rows.length === 0 ? (
        <div className="ios-glass rounded-2xl border p-10 text-center text-black/45 text-[14px]">
          {t('admin.noResults')}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const pct = row.total > 0 ? Math.round((row.score / row.total) * 100) : null;
            return (
              <div
                key={row.id}
                className="ios-glass rounded-2xl border border-white/60 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="min-w-0">
                  {row.subjectName && (
                    <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-600 mb-0.5">
                      {row.subjectName}
                    </p>
                  )}
                  <p className="font-semibold text-black/90 truncate">{row.topic || '—'}</p>
                  <p className="text-[12px] text-black/45 mt-1">
                    {row.firstName} {row.lastName}
                    {row.studentId ? ` · ${row.studentId}` : ''} · {formatWhen(row.submittedAt)}
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

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="p-2 rounded-lg border border-slate-200 bg-white disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-[12px] font-semibold text-black/60">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="p-2 rounded-lg border border-slate-200 bg-white disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
