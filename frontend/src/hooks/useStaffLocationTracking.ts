import { useEffect, useRef } from 'react';
import { postStaffLocationPing } from '../utils/staffLocationApi';
import {
  dispatchStaffGeoUpdate,
  MAX_CLIENT_ACCURACY_M,
  type StaffGeoDetail,
} from '../utils/staffLocationGeo';
import { isLikelyPhoneOrSmallTablet } from '../utils/deviceDetection';

function minSendIntervalMs(): number {
  return isLikelyPhoneOrSmallTablet() ? 20_000 : 45_000;
}

function watchOptions(): PositionOptions {
  const mobile = isLikelyPhoneOrSmallTablet();
  return {
    enableHighAccuracy: true,
    maximumAge: mobile ? 5_000 : 20_000,
    timeout: mobile ? 25_000 : 30_000,
  };
}

function accuracyOk(accuracy_m: number | null): boolean {
  if (accuracy_m == null || !Number.isFinite(accuracy_m)) return true;
  return accuracy_m <= MAX_CLIENT_ACCURACY_M;
}

/** Hodim telefonida fon GPS kuzatuvi. */
export function useStaffLocationTracking(
  enabled: boolean,
  options?: { silent?: boolean },
): void {
  const silent = options?.silent ?? false;
  const lastSentAt = useRef(0);
  const watchId = useRef<number | null>(null);
  const deniedNotified = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (
      !enabled ||
      !isLikelyPhoneOrSmallTablet() ||
      typeof navigator === 'undefined' ||
      !navigator.geolocation
    ) {
      return;
    }

    const minMs = minSendIntervalMs();

    const emitAndPost = async (detail: StaffGeoDetail) => {
      dispatchStaffGeoUpdate(detail);
      try {
        await postStaffLocationPing({
          latitude: detail.latitude,
          longitude: detail.longitude,
          accuracy_m: detail.accuracy_m,
          client_ts_ms: detail.recordedAt,
        });
      } catch {
        /* keyingi pingda uriniladi */
      }
    };

    const send = (pos: GeolocationPosition, force: boolean) => {
      const now = Date.now();
      if (!force && now - lastSentAt.current < minMs) return;

      const accuracy_m = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null;
      if (!accuracyOk(accuracy_m)) return;

      lastSentAt.current = now;
      void emitAndPost({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_m,
        recordedAt: now,
      });
    };

    const onErr = (err: GeolocationPositionError) => {
      if (silent) return;
      if (err.code === err.PERMISSION_DENIED && !deniedNotified.current) {
        deniedNotified.current = true;
        window.dispatchEvent(
          new CustomEvent('app:notify', {
            detail: {
              title: 'Joylashuv ruxsati kerak',
              body: 'Telefon sozlamalarida brauzer uchun joylashuvni yoqing (Safari / Chrome).',
              level: 'warning' as const,
            },
          }),
        );
      }
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => send(pos, true),
      onErr,
      { ...watchOptions(), maximumAge: 0 },
    );

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => send(pos, false),
      onErr,
      watchOptions(),
    );

    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || !mounted.current) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => send(pos, true),
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 25_000 },
      );
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [enabled, silent]);
}
