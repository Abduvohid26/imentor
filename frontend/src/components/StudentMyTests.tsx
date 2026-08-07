import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, RefreshCw } from 'lucide-react';
import { fetchMyLiveTestSubmissions, type StudentMySubmissionRow } from '../utils/liveTestApi';
import { useUiText } from '../i18n/useUiText';
import StaffPageLayout from './staff/StaffPageLayout';

function formatWhen(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '—';
  }
}

export default function StudentMyTests() {
  const { t } = useUiText();
  const [rows, setRows] = useState<StudentMySubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string>('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyLiveTestSubmissions();
      setRows(data);
    } catch (e) {
      console.error(e);
      setError(t('student.myTestsError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const otherLabel = t('student.myTestsSubjectOther');

  // Fanlar ro'yxati (filtr uchun) — nom bo'yicha noyob, bo'sh fanlar "Boshqa" ostiga tushadi.
  const subjects = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rows) {
      const label = r.subjectName || otherLabel;
      if (!seen.has(label)) {
        seen.add(label);
        out.push(label);
      }
    }
    return out;
  }, [rows, otherLabel]);

  const filteredRows = useMemo(() => {
    if (!subjectFilter) return rows;
    return rows.filter((r) => (r.subjectName || otherLabel) === subjectFilter);
  }, [rows, subjectFilter, otherLabel]);

  return (
    <StaffPageLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList className="text-blue-600" size={26} />
              {t('student.myTestsTitle')}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{t('student.myTestsSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw size={16} />
            {t('student.myTestsRefresh')}
          </button>
        </div>

        {!loading && !error && subjects.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSubjectFilter('')}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold border ${
                subjectFilter === ''
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {t('student.myTestsFilterAll')}
            </button>
            {subjects.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSubjectFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold border ${
                  subjectFilter === s
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-gray-500">
            <Loader2 className="mx-auto mb-2 animate-spin text-blue-600" />
            {t('student.myTestsLoading')}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800 font-medium">
            {error}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-gray-500">
            {t('student.myTestsEmpty')}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRows.map((row) => {
              const pct = row.total > 0 ? Math.round((row.score / row.total) * 100) : null;
              return (
                <div
                  key={row.id}
                  className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      {row.subjectName && (
                        <p className="text-[11px] font-bold uppercase tracking-wide text-blue-600 mb-0.5">
                          {row.subjectName}
                        </p>
                      )}
                      <h2 className="font-bold text-gray-900">
                        {row.topic || t('student.myTestsUntitled')}
                      </h2>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {row.firstName} {row.lastName}
                      </p>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {formatWhen(row.submittedAt)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    <p className="text-sm text-gray-600">
                      {t('student.myTestsAnswersCount', { count: String(row.answers.length) })}
                    </p>
                    {row.total > 0 && (
                      <span
                        className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${
                          pct !== null && pct >= 60
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {t('student.myTestsScore', { score: String(row.score), total: String(row.total) })}
                        {pct !== null ? ` (${pct}%)` : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </StaffPageLayout>
  );
}
