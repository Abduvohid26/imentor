import { useEffect, useRef } from 'react';
import { pushAppNotification } from '../../utils/notifications';
import { useUiText } from '../../i18n/useUiText';

type Props = {
  message: string;
  /** Xatoni bartaraf etuvchi amal (masalan "Qayta saqlash"). */
  actionLabel?: string;
  onAction?: () => void;
  actionBusy?: boolean;
};

/**
 * Sahifa ichidagi xato xabari.
 *
 * Bundan tashqari xatoni GLOBAL alert sifatida ham yuboradi (yuqori o'ng
 * burchak). Shu tufayli barcha mavjud `setError(...)` chaqiruvlarini
 * bittalab o'zgartirmasdan, hamma xato o'qituvchiga ko'rinadigan bo'ladi —
 * u sahifaning pastida bo'lsa ham.
 */
export default function StaffErrorAlert({ message, actionLabel, onAction, actionBusy }: Props) {
  const { t } = useUiText();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    const text = message?.trim();
    if (!text || lastSent.current === text) return;
    lastSent.current = text;
    pushAppNotification({ title: t('common.errorTitle'), body: text, level: 'error' });
  }, [message, t]);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-center gap-3 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100">
      <p className="text-[13px] text-rose-700 font-medium text-center sm:text-left">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          disabled={actionBusy}
          className="shrink-0 self-center rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
