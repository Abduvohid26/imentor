import { useMemo, useState } from 'react';
import { Languages, Loader2, RefreshCw, X } from 'lucide-react';
import type { AppLanguage } from '../../i18n/language';
import { useUiText } from '../../i18n/useUiText';
import type { CourseSyllabusRow } from '../../utils/syllabusApi';
import { httpJson } from '../../api/httpClient';
import { getBackendAccessToken } from '../../utils/backendAuth';

const LANGS: AppLanguage[] = ['uz', 'ru', 'en'];

function apiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.VITE_API_BASE_URL?.trim() || '/api';
}

function allTopicTitles(row: CourseSyllabusRow): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (items?: { title?: string }[]) => {
    for (const t of items || []) {
      const title = (t?.title || '').trim();
      if (title && !seen.has(title)) {
        seen.add(title);
        out.push(title);
      }
    }
  };
  for (const v of row.variants || []) add(v?.topics);
  add(row.topics);
  return out;
}

/**
 * Admin uchun: fan va mavzu nomlari tarjimasini qo'lda tuzatish.
 *
 * Tarjimalarni AI yaratadi, lekin tibbiy atamada xato bo'lishi mumkin —
 * bu oyna sifat nazorati uchun. Asl nom (chap ustun) o'zgarmaydi: u saqlash
 * kaliti va AI promptlari uchun ishlatiladi.
 */
export default function SyllabusTranslationsEditor({
  row,
  onClose,
  onSaved,
}: {
  row: CourseSyllabusRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useUiText();
  const sourceLang = (row.instruction_language || 'uz') as AppLanguage;
  const [lang, setLang] = useState<AppLanguage>(LANGS.find((l) => l !== sourceLang) || 'en');
  const [subjectName, setSubjectName] = useState(row.name_i18n?.[lang] || '');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titles = useMemo(() => allTopicTitles(row), [row]);
  const current = row.topics_i18n?.[lang] || {};

  const switchLang = (next: AppLanguage) => {
    setLang(next);
    setSubjectName(row.name_i18n?.[next] || '');
    setEdits({});
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const token = await getBackendAccessToken();
      if (!token) throw new Error('no-token');
      await httpJson(`${apiBaseUrl()}/v1/admin/course-syllabuses/${row.id}/translations/`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: { lang, subject_name: subjectName, topics: edits },
        timeoutMs: 60_000,
      });
      onSaved();
      onClose();
    } catch {
      setError(t('admin.error.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    setError(null);
    try {
      const token = await getBackendAccessToken();
      if (!token) throw new Error('no-token');
      await httpJson(`${apiBaseUrl()}/v1/course-syllabuses/${row.id}/translate/?lang=${lang}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: 300_000,
      });
      onSaved();
    } catch {
      setError(t('admin.error.saveFailed'));
    } finally {
      setRegenerating(false);
    }
  };

  const translatedCount = titles.filter((x) => (edits[x] ?? current[x] ?? '').trim()).length;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl">
        <header className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-bold text-slate-900">
              <Languages size={18} className="text-indigo-600" />
              {t('admin.translationsTitle')}
            </p>
            <p className="truncate text-[12px] text-slate-500">{row.subject_name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          {LANGS.filter((l) => l !== sourceLang).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => switchLang(l)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold uppercase ${
                lang === l ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {l}
            </button>
          ))}
          <span className="ml-auto text-[12px] text-slate-500">
            {translatedCount} / {titles.length}
          </span>
          <button
            type="button"
            onClick={() => void regenerate()}
            disabled={regenerating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {regenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {t('admin.retranslate')}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <label className="mb-4 block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-500">
              {t('admin.subjectNameLabel')}
            </span>
            <input
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder={row.subject_name}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px]"
            />
          </label>

          <div className="space-y-2">
            {titles.map((original) => (
              <div key={original} className="grid gap-2 sm:grid-cols-2">
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] leading-snug text-slate-600">
                  {original}
                </p>
                <input
                  value={edits[original] ?? current[original] ?? ''}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [original]: e.target.value }))}
                  placeholder="—"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
                />
              </div>
            ))}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t px-5 py-3">
          {error ? <p className="text-[13px] text-rose-600">{error}</p> : <span />}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              {t('common.close')}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {t('common.save')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
