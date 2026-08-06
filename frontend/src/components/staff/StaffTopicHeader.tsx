import type { ReactNode } from 'react';
import { GraduationCap } from 'lucide-react';
import { useUiText } from '../../i18n/useUiText';
import { staffCardLg, staffChip, staffChipAccent, staffEyebrow, STAFF_HEADING } from './staffUi';

export type StaffTopicInfo = {
  id: string;
  title: string;
  type: 'lecture' | 'practical';
  subjectName?: string;
  variantLabel?: string;
};

type Props = {
  moduleLabel: string;
  topic: StaffTopicInfo | null;
  hint?: string;
  actions?: ReactNode;
  children?: ReactNode;
};

export default function StaffTopicHeader({ moduleLabel, topic, hint, actions, children }: Props) {
  const { t } = useUiText();
  const typeLabel =
    topic?.type === 'practical' ? t('lecture.typePractical') : t('lecture.typeLecture');

  return (
    <div className={`${staffCardLg} p-5 sm:p-6 space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <p className={staffEyebrow}>{moduleLabel}</p>
          {topic ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {topic.subjectName && (
                  <span className={staffChip}>
                    <GraduationCap size={12} />
                    {topic.subjectName}
                  </span>
                )}
                <span className={staffChipAccent}>{topic.id}</span>
                <span className={staffChip}>{typeLabel}</span>
              </div>
              <h1 className={`text-[17px] sm:text-[19px] font-bold leading-snug ${STAFF_HEADING}`}>
                {topic.title}
              </h1>
            </>
          ) : null}
          {hint && <p className="text-[13px] text-black/50 leading-relaxed">{hint}</p>}
        </div>
        {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}
