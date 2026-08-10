import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { AppNotificationEventDetail, AppNotificationLevel } from '../utils/notifications';
import { useUiText } from '../i18n/useUiText';

/** Alert ekranda shuncha turadi, keyin o'zi yo'qoladi. */
export const TOAST_TIMEOUT_MS = 5_000;
/** Bir vaqtda ko'rinadigan maksimal alert (ekranni to'sib qo'ymasin). */
const MAX_VISIBLE = 4;

type Toast = AppNotificationEventDetail & { id: string };

const STYLES: Record<AppNotificationLevel, { box: string; icon: typeof Info; iconColor: string; bar: string }> = {
  info: { box: 'border-sky-200 bg-white', icon: Info, iconColor: 'text-sky-600', bar: 'bg-sky-500' },
  success: {
    box: 'border-emerald-200 bg-white',
    icon: CheckCircle2,
    iconColor: 'text-emerald-600',
    bar: 'bg-emerald-500',
  },
  warning: {
    box: 'border-amber-200 bg-white',
    icon: AlertTriangle,
    iconColor: 'text-amber-600',
    bar: 'bg-amber-500',
  },
  error: { box: 'border-rose-200 bg-white', icon: XCircle, iconColor: 'text-rose-600', bar: 'bg-rose-500' },
};

/**
 * Global alert (toast) tizimi — ekranning YUQORI O'NG burchagida chiqadi va
 * {@link TOAST_TIMEOUT_MS} dan keyin o'zi yo'qoladi.
 *
 * Manba: `pushAppNotification()` yuboradigan `app:notify` hodisasi. Shu
 * hodisa allaqachon qo'ng'iroq panelini ham to'ldiradi, ya'ni alert ko'zdan
 * qochsa ham xabar tarixda qoladi.
 *
 * Sichqoncha alert ustida turganda hisoblagich to'xtaydi — o'qituvchi uzun
 * xabarni o'qib ulgurmay yo'qolib qolmasin.
 */
export default function AppToastHost() {
  const { t } = useUiText();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, { id: number; endsAt: number }>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer.id);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const arm = useCallback(
    (id: string, ms: number) => {
      const handle = window.setTimeout(() => dismiss(id), ms);
      timers.current.set(id, { id: handle, endsAt: Date.now() + ms });
    },
    [dismiss],
  );

  useEffect(() => {
    const onNotify = (event: Event) => {
      const detail = (event as CustomEvent<AppNotificationEventDetail>).detail;
      if (!detail?.title && !detail?.body) return;
      const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { ...detail, id }].slice(-MAX_VISIBLE));
      arm(id, TOAST_TIMEOUT_MS);
    };
    window.addEventListener('app:notify', onNotify as EventListener);
    return () => window.removeEventListener('app:notify', onNotify as EventListener);
  }, [arm]);

  // Komponent yo'q qilinganda qolib ketgan taymerlarni tozalaymiz.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((tm) => window.clearTimeout(tm.id));
      map.clear();
    };
  }, []);

  const pause = (id: string) => {
    const timer = timers.current.get(id);
    if (!timer) return;
    window.clearTimeout(timer.id);
    timers.current.set(id, { id: 0, endsAt: timer.endsAt });
  };

  const resume = (id: string) => {
    const timer = timers.current.get(id);
    if (!timer) return;
    arm(id, Math.max(2000, timer.endsAt - Date.now()));
  };

  if (!toasts.length) return null;

  return (
    <div
      className="pointer-events-none fixed top-4 right-4 z-[300] flex w-[min(92vw,380px)] flex-col gap-2"
      role="region"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const style = STYLES[toast.level || 'info'];
          const Icon = style.icon;
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              onMouseEnter={() => pause(toast.id)}
              onMouseLeave={() => resume(toast.id)}
              className={`pointer-events-auto overflow-hidden rounded-xl border shadow-lg shadow-black/5 ${style.box}`}
            >
              <div className="flex items-start gap-2.5 p-3.5">
                <Icon size={18} className={`mt-0.5 shrink-0 ${style.iconColor}`} />
                <div className="min-w-0 flex-1">
                  {(toast.titleKey || toast.title) && (
                    <p className="text-[13.5px] font-bold leading-snug text-black/85">
                      {toast.titleKey ? t(toast.titleKey) : toast.title}
                    </p>
                  )}
                  {(toast.bodyKey || toast.body) && (
                    <p className="mt-0.5 text-[13px] leading-relaxed text-black/60">
                      {toast.bodyKey ? t(toast.bodyKey) : toast.body}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="-m-1 shrink-0 rounded-lg p-1 text-black/35 hover:bg-black/5 hover:text-black/60"
                  aria-label="close"
                >
                  <X size={15} />
                </button>
              </div>
              {/* Qolgan vaqtni ko'rsatuvchi chiziq */}
              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: TOAST_TIMEOUT_MS / 1000, ease: 'linear' }}
                className={`h-0.5 origin-left ${style.bar}`}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
