import React, { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { PreparedContentSummary } from '../../utils/preparedContentStore';
import SavedWorkBanner from './SavedWorkBanner';
import SavedWorkList from './SavedWorkList';
import { useUiText } from '../../i18n/useUiText';
import StaffTopicHeader, { type StaffTopicInfo } from './StaffTopicHeader';
import { staffBtnPrimary, staffBtnSecondary, staffInput, staffLabel } from './staffUi';
import {
  DEFAULT_TEST_DIFFICULTY,
  type TestDifficulty,
} from '../../utils/testDifficulty';

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
  questionCount?: number;
  onQuestionCountChange?: (value: number) => void;
  questionCountMin?: number;
  questionCountMax?: number;
  questionCountLabel?: string;
  difficulty?: TestDifficulty;
  onDifficultyChange?: (value: TestDifficulty) => void;
  /** Panelda allaqachon faol kontent ko'rsatilayotgan bo'lsa (masalan yangi yaratilgan test/QR),
   *  "Hali saqlangan variant yo'q" degan chalkashtiruvchi maslahat ko'rsatilmaydi —
   *  fon saqlash jarayoni tugamagan bo'lishi mumkin, lekin kontent allaqachon foydalanuvchiga ko'rinadi. */
  hasUnsavedActiveContent?: boolean;
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
  hasUnsavedActiveContent = false,
  extra,
  questionCount,
  onQuestionCountChange,
  questionCountMin = 10,
  questionCountMax = 30,
  questionCountLabel,
  difficulty,
  onDifficultyChange,
}: Props) {
  const { t, locale } = useUiText();
  const resolvedVersionsTitle = versionsTitle ?? t('toolbar.saved');
  const [showVersions, setShowVersions] = useState(false);
  const showTopicInput = !lockTopicFromSyllabus || !topic;
  const showQuestionCount = onQuestionCountChange != null && questionCount != null;
  const resolvedCountLabel = questionCountLabel ?? t('test.questionCountLabel');

  const questionCountField = showQuestionCount ? (
    <div className="space-y-1.5 shrink-0 w-full sm:w-[7.5rem]">
      <label className={staffLabel} htmlFor="staff-question-count">
        {resolvedCountLabel}
      </label>
      <input
        id="staff-question-count"
        type="number"
        min={questionCountMin}
        max={questionCountMax}
        step={1}
        value={questionCount}
        onChange={(e) => {
          const raw = Number.parseInt(e.target.value, 10);
          if (Number.isNaN(raw)) return;
          onQuestionCountChange(Math.min(questionCountMax, Math.max(questionCountMin, raw)));
        }}
        className={`${staffInput} tabular-nums`}
        disabled={loading}
      />
      <p className="text-[10px] text-black/40 leading-tight">
        {t('test.questionCountRange', { min: questionCountMin, max: questionCountMax })}
      </p>
    </div>
  ) : null;

  const showDifficulty = onDifficultyChange != null;
  const resolvedDifficulty = difficulty ?? DEFAULT_TEST_DIFFICULTY;
  const difficultyField = showDifficulty ? (
    <div className="space-y-1.5 shrink-0 w-full sm:w-auto">
      <p className={staffLabel} id="staff-test-difficulty-label">
        {t('test.difficultyLabel')}
      </p>
      <div
        role="group"
        aria-labelledby="staff-test-difficulty-label"
        className="flex rounded-xl border border-black/8 bg-white/60 p-0.5"
      >
        {(['easy', 'medium', 'hard'] as const).map((level) => {
          const active = resolvedDifficulty === level;
          return (
            <button
              key={level}
              type="button"
              disabled={loading}
              onClick={() => onDifficultyChange?.(level)}
              className={`flex-1 sm:flex-none px-3 h-10 rounded-[10px] text-[13px] font-semibold transition-colors ${
                active
                  ? 'bg-[#083047] text-white'
                  : 'text-[#083047]/70 hover:bg-white/80'
              }`}
            >
              {t(
                level === 'easy'
                  ? 'test.difficultyEasy'
                  : level === 'hard'
                    ? 'test.difficultyHard'
                    : 'test.difficultyMedium',
              )}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  const createButton = (
    <button
      type="button"
      onClick={onCreate}
      disabled={loading || !topicValue.trim()}
      className={`${staffBtnPrimary} h-11 shrink-0`}
    >
      {loading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
      {createLabel}
    </button>
  );

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
            {questionCountField}
            {difficultyField}
            {createButton}
          </div>
        )}

        {!showTopicInput && (
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            {questionCountField}
            {difficultyField}
            {createButton}
          </div>
        )}

        {extra}

        {/* Baza yopiq turadi (4 bo'limda bir xil): avval ingichka eslatma qatori
            ko'rinadi, "Baza" bosilganda saqlangan versiyalar ro'yxati ochiladi. */}
        {versions.length > 0 && !showVersions && (
          <SavedWorkBanner count={versions.length} onOpen={() => setShowVersions(true)} />
        )}

        {versions.length > 0 && showVersions && (
          <div className="space-y-2 pt-1 border-t border-black/5">
            <div className="flex items-center justify-between gap-2">
              <p className={staffLabel}>
                {resolvedVersionsTitle} ({versions.length})
              </p>
              <button
                type="button"
                onClick={() => setShowVersions(false)}
                className="shrink-0 rounded-lg border border-black/10 bg-white/70 px-2.5 py-1 text-[12px] font-semibold text-black/60 hover:border-black/20"
              >
                {t('common.close')}
              </button>
            </div>
            <SavedWorkList
              items={versions}
              activeId={activeVersionId}
              onSelect={onSelectVersion}
              onDelete={onDeleteVersion}
            />
          </div>
        )}

        {!loading && versions.length === 0 && topicValue.trim() && !hasUnsavedActiveContent && (
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
