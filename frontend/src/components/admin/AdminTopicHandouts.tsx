import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Image as ImageIcon, Loader2, RefreshCw, Search, Trash2, Upload } from 'lucide-react';
import { backendErrorMessage } from '../../utils/apiError';
import { fetchAdminCourseSyllabuses, type CourseSyllabusRow } from '../../utils/syllabusApi';
import { resolveSyllabusVariants } from '../../utils/syllabusVariant';
import SearchableSelect from './SearchableSelect';
import {
  deleteAdminHandout,
  fetchAdminHandouts,
  uploadAdminHandout,
  HANDOUT_FILE_ACCEPT,
  isAllowedHandoutFile,
  type TopicHandoutItem,
} from '../../utils/handoutApi';
import { useUiText } from '../../i18n/useUiText';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminTopicHandouts() {
  const { t } = useUiText();
  const [fans, setFans] = useState<CourseSyllabusRow[]>([]);
  const [handouts, setHandouts] = useState<TopicHandoutItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fanId, setFanId] = useState('');
  const [variantLabel, setVariantLabel] = useState('');
  const [topicCode, setTopicCode] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [adding, setAdding] = useState(false);

  const [search, setSearch] = useState('');
  const [fanFilter, setFanFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fanRows, rows] = await Promise.all([fetchAdminCourseSyllabuses(), fetchAdminHandouts()]);
      setFans(fanRows);
      setHandouts(rows);
    } catch {
      setError(t('admin.error.loadFailed'));
      setFans([]);
      setHandouts([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedFan = useMemo(() => fans.find((f) => String(f.id) === fanId) || null, [fans, fanId]);
  const variants = useMemo(() => (selectedFan ? resolveSyllabusVariants(selectedFan) : []), [selectedFan]);
  const selectedVariant = useMemo(
    () => variants.find((v) => v.label === variantLabel) || null,
    [variants, variantLabel],
  );
  const topics = selectedVariant?.topics ?? [];

  useEffect(() => {
    setVariantLabel(variants.length === 1 ? variants[0].label : '');
    setTopicCode('');
  }, [variants]);
  useEffect(() => {
    setTopicCode('');
  }, [variantLabel]);

  const fanNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const f of fans) m.set(f.id, f.subject_name);
    return m;
  }, [fans]);

  const fanFilterOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of handouts) {
      const sid = (h.topic_norm || '').split('::')[0];
      if (sid) m.set(sid, fanNameById.get(Number(sid)) || sid);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [handouts, fanNameById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return handouts.filter((h) => {
      const sid = (h.topic_norm || '').split('::')[0];
      if (fanFilter && sid !== fanFilter) return false;
      if (q) {
        const fanName = fanNameById.get(Number(sid)) || '';
        const hay = `${h.topic} ${h.title} ${h.file_name} ${fanName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [handouts, search, fanFilter, fanNameById]);

  const grouped = useMemo(() => {
    const map = new Map<string, { fanName: string; topic: string; rows: TopicHandoutItem[] }>();
    for (const h of filtered) {
      const syllabusId = Number((h.topic_norm || '').split('::')[0]);
      const fanName = fanNameById.get(syllabusId) || t('catalog.otherTopics');
      const key = `${fanName}||${h.topic}`;
      if (!map.has(key)) map.set(key, { fanName, topic: h.topic, rows: [] });
      map.get(key)!.rows.push(h);
    }
    return [...map.values()].sort(
      (a, b) => a.fanName.localeCompare(b.fanName) || a.topic.localeCompare(b.topic),
    );
  }, [filtered, fanNameById, t]);

  const addHandouts = async () => {
    if (!fanId || !variantLabel || !topicCode || files.length === 0) return;
    const topic = topics.find((tp) => tp.id === topicCode);
    if (!topic) return;
    setAdding(true);
    setError(null);
    try {
      for (const file of files) {
        await uploadAdminHandout({
          syllabusId: Number(fanId),
          variantLabel,
          topicCode,
          topic: topic.title,
          file,
        });
      }
      setFiles([]);
      setHandouts(await fetchAdminHandouts());
    } catch (err) {
      setError(backendErrorMessage(err) || t('admin.error.handoutAddFailed'));
    } finally {
      setAdding(false);
    }
  };

  const removeHandout = async (id: number) => {
    if (!window.confirm(t('admin.deleteConfirm'))) return;
    try {
      await deleteAdminHandout(id);
      setHandouts((prev) => prev.filter((h) => h.id !== id));
    } catch {
      setError(t('admin.error.deleteFailedGeneric'));
    }
  };

  const canAdd = Boolean(fanId && variantLabel && topicCode && files.length) && !adding;

  return (
    <div className="p-3 sm:p-5 lg:p-6 h-full overflow-y-auto w-full space-y-6">
      <div className="ios-glass rounded-3xl border border-white/70 p-6 shadow-sm flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center">
            <FileText size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t('admin.handoutsTitle')}</h2>
            <p className="text-[13px] text-slate-500 leading-relaxed">{t('admin.handoutsSubtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700"
        >
          <RefreshCw size={16} /> {t('admin.refresh')}
        </button>
      </div>

      {/* Qo'shish: fan → yo'nalish → mavzu → fayl */}
      <div className="ios-glass rounded-2xl border border-white/70 p-5 space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-[12px] font-semibold text-slate-600">{t('admin.subjectName')}</span>
            <SearchableSelect
              value={fanId}
              onChange={setFanId}
              disabled={adding}
              placeholder={t('admin.selectSubjectPlaceholder')}
              noMatchText={t('admin.noResults')}
              options={fans.map((f) => ({ value: String(f.id), label: f.subject_name }))}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[12px] font-semibold text-slate-600">{t('admin.previewVariant')}</span>
            <select
              value={variantLabel}
              onChange={(e) => setVariantLabel(e.target.value)}
              disabled={adding || !fanId || variants.length <= 1}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-[13px] disabled:bg-slate-50"
            >
              {variants.length !== 1 && <option value="">{t('admin.selectVariantPlaceholder')}</option>}
              {variants.map((v) => (
                <option key={v.label} value={v.label}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[12px] font-semibold text-slate-600">{t('admin.topicLabel')}</span>
            <select
              value={topicCode}
              onChange={(e) => setTopicCode(e.target.value)}
              disabled={adding || !variantLabel}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-[13px] disabled:bg-slate-50"
            >
              <option value="">{t('admin.selectTopicPlaceholder')}</option>
              {topics.map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {tp.id} · {tp.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-white border border-slate-100 px-3 py-1.5">
                <FileText size={14} className="text-slate-500 shrink-0" />
                <span className="text-[12px] text-slate-700 truncate flex-1">{f.name}</span>
                <span className="text-[11px] text-slate-400 shrink-0">{formatSize(f.size)}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={adding}
                  className="p-1 text-rose-400 hover:text-rose-600 disabled:opacity-40"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 cursor-pointer">
            <Upload size={16} />
            {t('admin.chooseFiles')}
            <input
              type="file"
              accept={HANDOUT_FILE_ACCEPT}
              multiple
              className="hidden"
              disabled={adding}
              onChange={(e) => {
                const picked = Array.from(e.target.files || []).filter(isAllowedHandoutFile);
                if (picked.length) {
                  setFiles((prev) => [...prev, ...picked]);
                  setError(null);
                }
                e.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => void addHandouts()}
            disabled={!canAdd}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 text-white text-[13px] font-semibold disabled:opacity-40"
          >
            {adding ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
            {t('admin.uploadHandout')}
          </button>
          {error && <p className="text-[13px] text-rose-600 font-medium">{error}</p>}
        </div>
      </div>

      {/* Qidiruv + fan filtri */}
      {!loading && handouts.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('admin.handoutsSearchPlaceholder')}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-[13px]"
            />
          </div>
          <select
            value={fanFilter}
            onChange={(e) => setFanFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13px]"
          >
            <option value="">{t('admin.filterAllSubjects')}</option>
            {fanFilterOptions.map(([sid, name]) => (
              <option key={sid} value={sid}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Ro'yxat */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-indigo-600" size={40} />
        </div>
      ) : handouts.length === 0 ? (
        <div className="ios-glass rounded-2xl border p-10 text-center text-slate-400 text-[14px]">
          {t('admin.handoutsEmpty')}
        </div>
      ) : grouped.length === 0 ? (
        <div className="ios-glass rounded-2xl border p-10 text-center text-slate-400 text-[14px]">
          {t('admin.noResults')}
        </div>
      ) : (
        <ul className="space-y-3">
          {grouped.map((g) => (
            <li key={`${g.fanName}-${g.topic}`} className="ios-glass rounded-2xl border border-white/70 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                <span className="font-bold text-slate-900">{g.topic}</span>
                <span className="text-[11px] text-slate-400"> · {g.fanName}</span>
              </div>
              <ul className="divide-y divide-slate-50">
                {g.rows.map((h) => (
                  <li key={h.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        h.kind === 'pdf' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
                      }`}
                    >
                      {h.kind === 'pdf' ? <FileText size={18} /> : <ImageIcon size={18} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-slate-800 truncate">{h.title || h.file_name}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {h.file_name} · {formatSize(h.file_size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeHandout(h.id)}
                      className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg shrink-0"
                      title={t('admin.delete')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
