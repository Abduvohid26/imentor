import type { LocalStaffUser } from './localStaffAuth';
import { isLikelyPhoneOrSmallTablet } from './deviceDetection';

const DESKTOP_PAIR_FLAG = 'imentor-desktop-paired-v1';

function pairKey(uid?: string): string {
  return uid ? `${DESKTOP_PAIR_FLAG}:${uid}` : DESKTOP_PAIR_FLAG;
}

export function markDesktopPairedSession(uid?: string): void {
  try {
    if (!uid) return;
    localStorage.setItem(pairKey(uid), '1');
    sessionStorage.setItem(pairKey(uid), '1');
  } catch {
    /* ignore */
  }
}

/** Faqat shu foydalanuvchi uchun juftlangan sessiya (global flag yo‘q). */
export function isDesktopPairedSession(uid?: string): boolean {
  if (!uid) return false;
  try {
    if (localStorage.getItem(pairKey(uid)) === '1') return true;
    return sessionStorage.getItem(pairKey(uid)) === '1';
  } catch {
    return false;
  }
}

export function clearDesktopPairedSession(uid?: string): void {
  try {
    if (uid) {
      localStorage.removeItem(pairKey(uid));
      sessionStorage.removeItem(pairKey(uid));
    }
    localStorage.removeItem(DESKTOP_PAIR_FLAG);
    sessionStorage.removeItem(DESKTOP_PAIR_FLAG);
  } catch {
    /* ignore */
  }
}

/** Hodim mobil hamroh: faqat telefon/planshetda (kompyuterda QR skaner emas). */
export function shouldHodimUseMobileCompanion(
  user: LocalStaffUser | null,
  isMobileDevice?: boolean,
): boolean {
  if (!user || (user.role ?? 'hodim') !== 'hodim') return false;
  return isMobileDevice ?? isLikelyPhoneOrSmallTablet();
}
