import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Trash2, RefreshCw, Loader2, Search, GraduationCap } from 'lucide-react';
import { motion } from 'motion/react';
import {
  deleteAdminCatalogItem,
  fetchAdminCatalogItems,
  groupCatalogBySubject,
  type CatalogItemSummary,
} from '../../utils/contentCatalogApi';
import { useUiText } from '../../i18n/useUiText';

export default function AdminTestsLibrary() {
  const { t, language } = useUiText();
  const [rows, setRows] = useState<CatalogItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [fanFilter, setFanFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchAdminCatalogItems({ kind: 'test' }));
    } catch {
      setRows([]);
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

  // Filtr uchun fanlar ro'yxati (mavjud testlardagi noyob fanlar)
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
        const hay = `${r.topic} ${r.author_display_name} ${r.subject_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, fanFilter]);

  const grouped = useMemo(() => groupCatalogBySubject(filtered, language), [filtered, language]);

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

      {/* Qidiruv + fan filtri */}
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
                    <p className="text-[12px] text-black/45 mt-1">
                      {row.author_display_name} · {new Date(row.created_at).toLocaleString()} ·{' '}
                      {row.question_count} {t('admin.questions')}
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
