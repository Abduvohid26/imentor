import type { UiTextKey } from '../i18n/translations';

export type AppNotificationLevel = 'info' | 'success' | 'warning' | 'error';

export interface AppNotificationEventDetail {
  title: string;
  body: string;
  level?: AppNotificationLevel;
  /**
   * Tarjima kalitlari — berilsa, qo'ng'iroq panelidagi TARIX shu kalitlar
   * bo'yicha JORIY tilda ko'rsatiladi. Aks holda xabar yozilgan paytdagi
   * tilda muzlab qoladi (til almashtirilsa ham o'zgarmaydi).
   */
  titleKey?: UiTextKey;
  bodyKey?: UiTextKey;
}

export function pushAppNotification(detail: AppNotificationEventDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AppNotificationEventDetail>('app:notify', { detail }));
}
