import { useEffect, useRef } from 'react';
import { pushAppNotification } from '../../utils/notifications';
import { useUiText } from '../../i18n/useUiText';

type Props = {
  message: string;
};

/**
 * Sahifa ichidagi xato xabari.
 *
 * Bundan tashqari xatoni GLOBAL alert sifatida ham yuboradi (yuqori o'ng
 * burchak). Shu tufayli barcha mavjud `setError(...)` chaqiruvlarini
 * bittalab o'zgartirmasdan, hamma xato o'qituvchiga ko'rinadigan bo'ladi —
 * u sahifaning pastida bo'lsa ham.
 */
export default function StaffErrorAlert({ message }: Props) {
  const { t } = useUiText();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    const text = message?.trim();
    if (!text || lastSent.current === text) return;
    lastSent.current = text;
    pushAppNotification({ title: t('common.errorTitle'), body: text, level: 'error' });
  }, [message, t]);

  return (
    <p className="text-[13px] text-rose-700 font-medium text-center px-4 py-3 rounded-xl bg-rose-50 border border-rose-100">
      {message}
    </p>
  );
}
