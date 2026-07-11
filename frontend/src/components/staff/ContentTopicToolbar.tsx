import React from 'react';
import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { PreparedContentSummary } from '../../utils/preparedContentStore';
import { useUiText } from '../../i18n/useUiText';

type Props = {
  topic: string;
  onTopicChange: (value: string) => void;
  topicLabel: string;
  topicPlaceholder: string;
  createLabel: string;
  loading: boolean;
  onCreate: () => void;
  accent?: 'emerald' | 'indigo';
  versions: PreparedContentSummary[];
  activeVersionId: string | null;
  onSelectVersion: (id: string) => void;
  onDeleteVersion?: (id: string) => void;
  versionsTitle?: string;
};

function formatWhen(ts: number, locale: string): string {
  return new Date(ts).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ContentTopicToolbar({
  topic,
  onTopicChange,
  topicLabel,
  topicPlaceholder,
  createLabel,
  loading,
  onCreate,
  accent = 'emerald',
  versions,
  activeVersionId,
  onSelectVersion,
  onDeleteVersion,
  versionsTitle,
}: Props) {
  const { t, locale } = useUiText();
  const resolvedVersionsTitle = versionsTitle ?? t('toolbar.saved');
  const btn =
    accent === 'emerald'
      ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
      : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20';
  const ring = accent === 'emerald' ? 'focus:border-emerald-400' : 'focus:border-indigo-400';

  return (
    <div className="ios-glass p-4 sm:p-5 rounded-[1.5rem] border border-white/70 shadow-sm space-y-4 print:hidden">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1 min-w-0 space-y-1.5">
          <label className="text-[12px] font-semibold text-black/60 ml-1">{topicLabel}</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => onTopicChange(e.target.value)}
            placeholder={topicPlaceholder}
            className={`w-full h-11 px-4 bg-white/60 border border-white/70 rounded-xl outline-none focus:bg-white text-[14px] ${ring}`}
          />
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={loading || !topic.trim()}
          className={`h-11 px-5 shrink-0 rounded-xl text-white text-[14px] font-semibold shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 ${btn}`}
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
          {createLabel}
        </button>
      </div>

      {versions.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-black/5">
          <p className="text-[12px] font-semibold text-black/50">
            {resolvedVersionsTitle} ({versions.length}) — {t('toolbar.savedHint')}
          </p>
          <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto scrollbar-hide">
            {versions.map((v) => {
              const active = activeVersionId === v.id;
              return (
                <div key={v.id} className="inline-flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => onSelectVersion(v.id)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
                      active
                        ? accent === 'emerald'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white/70 text-black/70 border-black/10 hover:border-black/20'
                    }`}
                  >
                    {formatWhen(v.createdAt, locale)}
                  </button>
                  {onDeleteVersion && (
                    <button
                      type="button"
                      onClick={() => onDeleteVersion(v.id)}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200"
                      aria-label={t('toolbar.deleteVersion')}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && versions.length === 0 && topic.trim() && (
        <p className="text-[12px] text-black/45 flex items-center gap-1.5">
          <Sparkles size={14} className="opacity-60" />
          {t('toolbar.noVersions', { action: createLabel })}
        </p>
      )}
    </div>
  );
}
