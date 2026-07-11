export type AppNotificationLevel = 'info' | 'success' | 'warning' | 'error';

export interface AppNotificationEventDetail {
  title: string;
  body: string;
  level?: AppNotificationLevel;
}

export function pushAppNotification(detail: AppNotificationEventDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AppNotificationEventDetail>('app:notify', { detail }));
}
