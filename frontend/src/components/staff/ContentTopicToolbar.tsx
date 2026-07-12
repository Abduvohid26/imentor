import React from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { PreparedContentSummary } from '../../utils/preparedContentStore';
import { useUiText } from '../../i18n/useUiText';
import StaffTopicHeader, { type StaffTopicInfo } from './StaffTopicHeader';
import { staffBtnPrimary, staffBtnSecondary, staffInput, staffLabel } from './staffUi';

type Props = {
  moduleLabel: string;
  topic: StaffTopicInfo | null;
  topicValue: string;
  onTopicChange: (value: string) => void;
  topicLabel: string;
  topicPlaceholder: string;
  createLabel: string;
  loading: boolean;
  onCreate: () => void;
  hint?: string;
  versions: PreparedContentSummary[];
  activeVersionId: string | null;
  onSelectVersion: (id: string) => void;
  onDeleteVersion?: (id: string) => void;
  versionsTitle?: string;
  /** Syllabus mavzusi bo'lsa — input yashirin, faqat chip header */
  lockTopicFromSyllabus?: boolean;
  extra?: React.ReactNode;
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
  moduleLabel,
  topic,
  topicValue,
  onTopicChange,
  topicLabel,
  topicPlaceholder,
  createLabel,
  loading,
  onCreate,
  hint,
  versions,
  activeVersionId,
  onSelectVersion,
  onDeleteVersion,
  versionsTitle,
  lockTopicFromSyllabus = false,
  extra,
}: Props) {
  const { t, locale } = useUiText();
  const resolvedVersionsTitle = versionsTitle ?? t('toolbar.saved');
  const showTopicInput = !lockTopicFromSyllabus || !topic;

  return (
    <StaffTopicHeader moduleLabel={moduleLabel} topic={topic} hint={hint}>
      <div className="space-y-4 pt-1">
        {showTopicInput && (
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1 min-w-0 space-y-1.5">
              <label className={staffLabel}>{topicLabel}</label>
              <input
                type="text"
                value={topicValue}
                onChange={(e) => onTopicChange(e.target.value)}
                placeholder={topicPlaceholder}
                className={staffInput}
              />
            </div>
            <button
              type="button"
              onClick={onCreate}
              disabled={loading || !topicValue.trim()}
              className={`${staffBtnPrimary} h-11 shrink-0`}
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              {createLabel}
            </button>
          </div>
        )}

        {!showTopicInput && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCreate}
              disabled={loading || !topicValue.trim()}
              className={staffBtnPrimary}
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              {createLabel}
            </button>
          </div>
        )}

        {extra}

        {versions.length > 0 && (
          <div className="space-y-2 pt-1 border-t border-black/5">
            <p className={staffLabel}>
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
                          ? 'bg-[#083047] text-white border-[#083047]'
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

        {!loading && versions.length === 0 && topicValue.trim() && (
          <p className="text-[12px] text-black/45">{t('toolbar.noVersions', { action: createLabel })}</p>
        )}
      </div>
    </StaffTopicHeader>
  );
}

/** Ichki sekundar tugmalar (PDF, yangilash) */
export function StaffToolbarActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

export function StaffToolbarButton({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const cls = primary ? staffBtnPrimary : staffBtnSecondary;
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}
