import { useSyncExternalStore } from 'react';
import { isLikelyPhoneOrSmallTablet } from '../utils/deviceDetection';

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const onChange = () => onStoreChange();
  const media = [
    '(max-width: 640px)',
    '(max-width: 768px) and (pointer: coarse)',
    '(min-width: 1024px) and (pointer: fine)',
  ];

  const cleanups: Array<() => void> = [];
  for (const query of media) {
    try {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      cleanups.push(() => mq.removeEventListener('change', onChange));
    } catch {
      /* ignore */
    }
  }
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);
  cleanups.push(() => {
    window.removeEventListener('resize', onChange);
    window.removeEventListener('orientationchange', onChange);
  });

  return () => {
    for (const fn of cleanups) fn();
  };
}

function getDeviceMobileSnapshot(): boolean {
  return isLikelyPhoneOrSmallTablet();
}

/** Ekran o‘lchami / pointer o‘zgarganda mobil-desktop ajratish yangilanadi. */
export function useDeviceProfile(): { isMobile: boolean; isDesktop: boolean } {
  const isMobile = useSyncExternalStore(subscribe, getDeviceMobileSnapshot, () => false);
  return { isMobile, isDesktop: !isMobile };
}
