import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  Trash2,
  RefreshCw,
  Loader2,
  Search,
  GraduationCap,
  BarChart3,
  Users,
  Layers,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  deleteAdminCatalogItem,
  fetchAdminCatalogItems,
  fetchAdminCatalogStats,
  groupCatalogBySubject,
  type CatalogItemSummary,
  type CatalogStats,
} from '../../utils/contentCatalogApi';
import { useUiText } from '../../i18n/useUiText';

function StatChip({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 min-w-[88px]">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-lg font-bold text-slate-900 tabular-nums">{value}</p>
    </div>
  );
}

export default function AdminTestsLibrary() {
  const { t, language } = useUiText();
  const [rows, setRows] = useState<CatalogItemSummary[]>([]);
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [fanFilter, setFanFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [items, statData] = await Promise.all([
        fetchAdminCatalogItems({ kind: 'test' }),
        fetchAdminCatalogStats({ kind: 'test' }),
      ]);
      setRows(items);
      setStats(statData);
    } catch {
      setRows([]);
      setStats(null);
      setError(t('admin.error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = useCallback(
    async (id: number) => {
      if (!window.confirm(t('admin.deleteConfirm'))) return;
      try {
        await deleteAdminCatalogItem(id);
        await load();
      } catch {
        setError(t('admin.error.deleteFailedGeneric'));
      }
    },
    [t, load],
  );

  const fanOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      const code = r.subject_code?.trim();
      if (code) map.set(code, r.subject_name?.trim() || code);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (fanFilter && r.subject_code !== fanFilter) return false;
      if (q) {
        const hay = `${r.topic} ${r.author_display_name} ${r.subject_name} ${r.variant_label} ${r.topic_code}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, fanFilter]);

  const grouped = useMemo(() => groupCatalogBySubject(filtered, language), [filtered, language]);

  const totals = stats?.totals;

  return (
    <div className="w-full space-y-6 pb-16 px-3 sm:px-5 lg:px-6 py-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center">
            <ClipboardList size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-black/90">{t('admin.testsLibraryTitle')}</h1>
            <p className="text-[12px] text-black/50">{t('admin.testsLibrarySubtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-black/10 bg-white text-[13px] font-semibold"
        >
          <RefreshCw size={16} /> {t('admin.refresh')}
        </button>
      </div>

      {error && <p className="text-[13px] text-rose-600 font-medium">{error}</p>}

      {totals && (
        <div className="ios-glass rounded-2xl border border-white/60 p-4 space-y-4">
          <div className="flex items-center gap-2 text-slate-800">
            <BarChart3 size={18} className="text-indigo-600" />
            <h2 className="font-bold text-[15px]">{t('admin.testStatsTitle')}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatChip label={t('admin.statsTotalTests')} value={totals.test_count} />
            <StatChip label={t('admin.statsQuestions')} value={totals.questions_total} />
            <StatChip label={t('admin.statsSubjects')} value={totals.subjects_distinct} />
            <StatChip label={t('admin.statsVariants')} value={totals.variants_distinct} />
            <StatChip label={t('admin.statsTopics')} value={totals.topics_distinct} />
            <StatChip label={t('admin.statsAuthors')} value={totals.authors_distinct} />
            <StatChip label={t('admin.statsPendingPublish')} value={totals.pending_publish_count} />
            <StatChip label={t('admin.statsLast7d')} value={totals.created_last_7d} />
          </div>

          {stats.by_subject.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-slate-500">
                <GraduationCap size={14} /> {t('admin.statsBySubject')}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {stats.by_subject.map((row) => (
                  <div key={row.subject_code || row.subject_name} className="rounded-xl border border-slate-100 bg-white/80 p-3">
                    <p className="font-semibold text-slate-900 text-[13px] truncate">{row.subject_name || row.subject_code}</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {row.test_count} {t('admin.statsTestsShort')} · {row.variants_distinct} {t('admin.statsVariantsShort')} · {row.topics_distinct} {t('admin.statsTopicsShort')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.by_variant.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-slate-500">
                <Layers size={14} /> {t('admin.statsByVariant')}
              </div>
              <div className="flex flex-wrap gap-2">
                {stats.by_variant.slice(0, 12).map((row) => (
                  <span
                    key={`${row.subject_code}-${row.variant_label}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-900"
                  >
                    {row.subject_name}: {row.variant_label}
                    <span className="text-indigo-500">({row.test_count})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {stats.by_author.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-slate-500">
                <Users size={14} /> {t('admin.statsByAuthor')}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {stats.by_author.slice(0, 6).map((row) => (
                  <div key={row.owner_key} className="rounded-xl border border-slate-100 bg-white/80 px-3 py-2 flex justify-between gap-2">
                    <span className="text-[13px] font-medium text-slate-800 truncate">{row.author_display_name}</span>
                    <span className="text-[12px] font-bold text-slate-500 tabular-nums shrink-0">{row.test_count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.testsSearchPlaceholder')}
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-[13px]"
          />
        </div>
        <select
          value={fanFilter}
          onChange={(e) => setFanFilter(e.target.value)}
          className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13px]"
        >
          <option value="">{t('admin.filterAllSubjects')}</option>
          {fanOptions.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-indigo-600" size={40} />
          </div>
        ) : rows.length === 0 ? (
          <div className="ios-glass rounded-2xl border p-10 text-center text-black/45 text-[14px]">
            {t('admin.noRecordsYet', { action: t('admin.testCreation') })}
          </div>
        ) : filtered.length === 0 ? (
          <div className="ios-glass rounded-2xl border p-10 text-center text-black/45 text-[14px]">
            {t('admin.noResults')}
          </div>
        ) : (
          [...grouped.entries()].map(([subject, items]) => (
            <div key={subject} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <GraduationCap size={16} className="text-indigo-600 shrink-0" />
                <span className="font-bold text-slate-900">{subject}</span>
                <span className="text-[11px] text-slate-400">· {items.length}</span>
              </div>
              {items.map((row) => (
                <motion.div
                  key={row.id}
                  layout
                  className="ios-glass rounded-2xl border border-white/60 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-black/90 truncate">{row.topic}</p>
                    <p className="text-[12px] text-black/45 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{row.author_display_name}</span>
                      {row.variant_label ? (
                        <span className="inline-flex items-center gap-1 text-indigo-600/80">
                          <Layers size={11} /> {row.variant_label}
                          {row.topic_code ? ` · ${row.topic_code.toUpperCase()}` : ''}
                        </span>
                      ) : null}
                      <span>
                        {new Date(row.created_at).toLocaleString()} · {row.question_count} {t('admin.questions')}
                      </span>
                      {!row.is_published ? (
                        <span className="text-amber-600 font-semibold">{t('admin.statsPendingBadge')}</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleDelete(row.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 text-[12px] font-semibold text-rose-700"
                    >
                      <Trash2 size={14} /> {t('admin.delete')}
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
