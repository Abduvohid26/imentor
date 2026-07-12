import type { LucideIcon } from 'lucide-react';
import { staffCard, staffBtnPrimary, STAFF_HEADING } from './staffUi';

type Props = {
  icon: LucideIcon;
  title: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function StaffEmptyState({
  icon: Icon,
  title,
  hint,
  actionLabel,
  onAction,
}: Props) {
  return (
    <div className="max-w-lg mx-auto">
      <div className={`${staffCard} p-8 text-center space-y-4`}>
        <Icon size={40} className="mx-auto text-[#083047]/70" />
        <h2 className={`text-lg font-bold ${STAFF_HEADING}`}>{title}</h2>
        <p className="text-[14px] text-black/55 leading-relaxed">{hint}</p>
        {actionLabel && onAction && (
          <button type="button" onClick={onAction} className={staffBtnPrimary}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
