import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  ClipboardList,
  GraduationCap,
  Loader2,
  RefreshCw,
  Target,
  TrendingUp,
} from 'lucide-react';
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

/** Ball foizi bo'yicha rang — butun sahifada bir xil qoida. */
function scoreTone(pct: number | null): { chip: string; bar: string; text: string } {
  if (pct === null) return { chip: 'bg-slate-100 text-slate-600', bar: 'bg-slate-300', text: 'text-slate-600' };
  if (pct >= 80) return { chip: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500', text: 'text-emerald-700' };
  if (pct >= 60) return { chip: 'bg-sky-50 text-sky-700', bar: 'bg-sky-500', text: 'text-sky-700' };
  if (pct >= 40) return { chip: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500', text: 'text-amber-700' };
  return { chip: 'bg-rose-50 text-rose-700', bar: 'bg-rose-500', text: 'text-rose-700' };
}

type DateRange = 'all' | '7d' | '30d' | '90d';

const RANGE_DAYS: Record<Exclude<DateRange, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="ios-glass rounded-2xl border border-white/70 p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-black/40 truncate">{label}</p>
        <p className="text-[19px] font-bold text-[#083047] leading-tight">{value}</p>
      </div>
    </div>
  );
}

/** Filtr tugmalari qatori — kafedra/fan/sana uchun bir xil ko'rinish. */
function FilterRow({
  icon: Icon,
  label,
  options,
  value,
  onChange,
}: {
  icon: typeof ClipboardList;
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  if (options.length <= 2) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-black/40 flex items-center gap-1.5">
        <Icon size={12} />
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${
              value === o.value
                ? 'bg-[#083047] text-white border-[#083047]'
                : 'bg-white/70 text-black/60 border-black/10 hover:border-black/25'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function StudentMyTests() {
  const { t } = useUiText();
  const [rows, setRows] = useState<StudentMySubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [departmentFilter, setDepartmentFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [range, setRange] = useState<DateRange>('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchMyLiveTestSubmissions());
    } catch (e) {
      console.error(e);
      setError(t('student.myTestsError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const otherLabel = t('student.myTestsSubjectOther');
  const deptOf = (r: StudentMySubmissionRow) => r.department || otherLabel;
  const subjOf = (r: StudentMySubmissionRow) => r.subjectName || otherLabel;

  // Kafedra ro'yxati — barcha natijalardan.
  const departmentOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) seen.add(deptOf(r));
    return [
      { value: '', label: t('student.myTestsFilterAllDepartments') },
      ...[...seen].sort().map((d) => ({ value: d, label: d })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, otherLabel, t]);

  // Fan ro'yxati — tanlangan kafedraga bog'liq (kafedra→fan ierarxiyasi).
  const subjectOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) {
      if (departmentFilter && deptOf(r) !== departmentFilter) continue;
      seen.add(subjOf(r));
    }
    return [
      { value: '', label: t('student.myTestsFilterAll') },
      ...[...seen].sort().map((s) => ({ value: s, label: s })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, departmentFilter, otherLabel, t]);

  // Kafedra almashsa, unga tegishli bo'lmagan fan filtri qolib ketmasin.
  useEffect(() => {
    if (subjectFilter && !subjectOptions.some((o) => o.value === subjectFilter)) {
      setSubjectFilter('');
    }
  }, [subjectOptions, subjectFilter]);

  const rangeOptions = [
    { value: 'all', label: t('student.myTestsRangeAll') },
    { value: '7d', label: t('student.myTestsRange7d') },
    { value: '30d', label: t('student.myTestsRange30d') },
    { value: '90d', label: t('student.myTestsRange90d') },
  ];

  const filteredRows = useMemo(() => {
    const cutoff =
      range === 'all' ? 0 : Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
    return rows.filter((r) => {
      if (departmentFilter && deptOf(r) !== departmentFilter) return false;
      if (subjectFilter && subjOf(r) !== subjectFilter) return false;
      if (cutoff && (!Number.isFinite(r.submittedAt) || r.submittedAt < cutoff)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, departmentFilter, subjectFilter, range, otherLabel]);

  // Statistika — filtrga mos natijalar bo'yicha.
  const stats = useMemo(() => {
    const scored = filteredRows.filter((r) => r.total > 0);
    const pcts = scored.map((r) => (r.score / r.total) * 100);
    const subjects = new Set(filteredRows.map((r) => subjOf(r)));
    return {
      count: filteredRows.length,
      subjects: subjects.size,
      avg: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
      best: pcts.length ? Math.round(Math.max(...pcts)) : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRows, otherLabel]);

  // Natijalarni fan bo'yicha guruhlaymiz — "qaysi fandan qanday" ko'rinib tursin.
  const grouped = useMemo(() => {
    const map = new Map<string, { subject: string; department: string; rows: StudentMySubmissionRow[] }>();
    for (const r of filteredRows) {
      const key = subjOf(r);
      if (!map.has(key)) map.set(key, { subject: key, department: r.department || '', rows: [] });
      map.get(key)!.rows.push(r);
    }
    return [...map.values()].sort((a, b) => a.subject.localeCompare(b.subject));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRows, otherLabel]);

  const avgTone = scoreTone(stats.avg);

  return (
    <StaffPageLayout spacious>
      <div className="ios-glass rounded-[1.5rem] border border-white/70 p-5 sm:p-6 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0">
            <ClipboardList size={24} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[#083047]">{t('student.myTestsTitle')}</h1>
            <p className="text-[13px] text-black/50 leading-relaxed">{t('student.myTestsSubtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white/80 px-4 py-2 text-[13px] font-semibold text-[#083047] hover:bg-white disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {t('student.myTestsRefresh')}
        </button>
      </div>

      {loading ? (
        <div className="ios-glass rounded-2xl border border-white/70 p-10 text-center text-black/50">
          <Loader2 className="mx-auto mb-2 animate-spin text-blue-600" />
          {t('student.myTestsLoading')}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800 font-medium">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="ios-glass rounded-2xl border border-white/70 p-10 text-center text-black/45">
          {t('student.myTestsEmpty')}
        </div>
      ) : (
        <>
          {/* Statistika */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={ClipboardList}
              label={t('student.myTestsStatTotal')}
              value={String(stats.count)}
              tone="bg-blue-50 text-blue-600"
            />
            <StatCard
              icon={GraduationCap}
              label={t('student.myTestsStatSubjects')}
              value={String(stats.subjects)}
              tone="bg-violet-50 text-violet-600"
            />
            <StatCard
              icon={TrendingUp}
              label={t('student.myTestsStatAvg')}
              value={stats.avg !== null ? `${stats.avg}%` : '—'}
              tone={`${avgTone.chip}`}
            />
            <StatCard
              icon={Target}
              label={t('student.myTestsStatBest')}
              value={stats.best !== null ? `${stats.best}%` : '—'}
              tone="bg-emerald-50 text-emerald-600"
            />
          </div>

          {/* Filtrlar: kafedra → fan → sana */}
          <div className="ios-glass rounded-2xl border border-white/70 p-4 space-y-3">
            <FilterRow
              icon={Building2}
              label={t('student.myTestsFilterDepartment')}
              options={departmentOptions}
              value={departmentFilter}
              onChange={setDepartmentFilter}
            />
            <FilterRow
              icon={GraduationCap}
              label={t('student.myTestsFilterSubject')}
              options={subjectOptions}
              value={subjectFilter}
              onChange={setSubjectFilter}
            />
            <FilterRow
              icon={Calendar}
              label={t('student.myTestsFilterPeriod')}
              options={rangeOptions}
              value={range}
              onChange={(v) => setRange(v as DateRange)}
            />
          </div>

          {/* Natijalar — fan bo'yicha guruhlangan */}
          {grouped.length === 0 ? (
            <div className="ios-glass rounded-2xl border border-white/70 p-10 text-center text-black/45">
              {t('student.myTestsNoMatch')}
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map((g) => {
                const scored = g.rows.filter((r) => r.total > 0);
                const gAvg = scored.length
                  ? Math.round(scored.reduce((a, r) => a + (r.score / r.total) * 100, 0) / scored.length)
                  : null;
                const gTone = scoreTone(gAvg);
                return (
                  <div key={g.subject} className="ios-glass rounded-2xl border border-white/70 overflow-hidden">
                    <div className="px-4 py-3 border-b border-black/5 flex items-center gap-2 flex-wrap">
                      <GraduationCap size={16} className="text-blue-600 shrink-0" />
                      <span className="font-bold text-[#083047] truncate">{g.subject}</span>
                      {g.department && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-black/45 bg-black/5 px-2 py-0.5 rounded-md">
                          <Building2 size={11} />
                          {g.department}
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-black/40">
                          {t('student.myTestsCount', { count: g.rows.length })}
                        </span>
                        {gAvg !== null && (
                          <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${gTone.chip}`}>
                            {gAvg}%
                          </span>
                        )}
                      </span>
                    </div>

                    <ul className="divide-y divide-black/5">
                      {g.rows.map((row) => {
                        const pct = row.total > 0 ? Math.round((row.score / row.total) * 100) : null;
                        const tone = scoreTone(pct);
                        return (
                          <li key={row.id} className="px-4 py-3 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-[14px] font-semibold text-[#083047] leading-snug">
                                  {row.topic || t('student.myTestsUntitled')}
                                </p>
                                <p className="text-[11px] text-black/40 mt-0.5">
                                  {formatWhen(row.submittedAt)}
                                </p>
                              </div>
                              {row.total > 0 ? (
                                <span className={`shrink-0 text-[13px] font-bold px-2.5 py-1 rounded-full ${tone.chip}`}>
                                  {row.score}/{row.total}
                                  {pct !== null ? ` · ${pct}%` : ''}
                                </span>
                              ) : (
                                <span className="shrink-0 text-[12px] font-semibold text-black/40">
                                  {t('student.myTestsAnswersCount', { count: String(row.answers.length) })}
                                </span>
                              )}
                            </div>
                            {pct !== null && (
                              <div className="h-1.5 w-full rounded-full bg-black/5 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${tone.bar}`}
                                  style={{ width: `${Math.max(2, pct)}%` }}
                                />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </StaffPageLayout>
  );
}
