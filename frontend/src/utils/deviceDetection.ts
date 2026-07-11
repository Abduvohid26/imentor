/**
 * Veb-ilovada "kompyuter vs telefon" taxminiy ajratish.
 * Sensorli noutbuklar telefon deb olinmasin (fine pointer + keng ekran).
 */
export function isLikelyPhoneOrSmallTablet(): boolean {
  if (typeof window === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const mobileUa = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const ipadUa = /iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  try {
    const narrow = window.matchMedia('(max-width: 640px)').matches;
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const wideScreen = window.matchMedia('(min-width: 1024px)').matches;
    const coarseSmall = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;

    // Noutbuk / monitor: keng ekran + sichqoncha/trackpad
    if (wideScreen && finePointer) return false;

    if (mobileUa && (narrow || coarseSmall)) return true;
    if (ipadUa && !finePointer) return true;
    if (narrow) return true;
    if (coarseSmall && !finePointer) return true;

    return false;
  } catch {
    return window.innerWidth < 640 || (mobileUa && window.innerWidth < 900);
  }
}

/** Keng ekran / kompyuter (hodim QR kirish) */
export function isDesktopBrowser(): boolean {
  return !isLikelyPhoneOrSmallTablet();
}
