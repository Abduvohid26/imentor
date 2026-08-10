import type { UiTextKey } from '../i18n/translations';

/**
 * Demo hisoblarning profil qiymatlarini interfeys tiliga moslash.
 *
 * Demo foydalanuvchilar (`ensureDefaultRoleDemosExist`) kodda qotirilgan
 * o'zbekcha qiymatlar bilan yaratiladi: ism o'rnida "O'qituvchi",
 * fakultet "Tibbiyot fakulteti" va h.k. Bular haqiqiy foydalanuvchi
 * ma'lumoti emas — ular KOD matni, shuning uchun rus/ingliz interfeysida
 * o'zbekcha qolib ketmasligi kerak.
 *
 * Qiymat localStorage'ga bir marta yozilgani uchun (til tanlashdan oldin)
 * tarjima ko'rsatish paytida qo'llanadi.
 *
 * Haqiqiy foydalanuvchi kiritgan matn bu ro'yxatga tushmaydi va
 * o'zgarishsiz ko'rsatiladi.
 */
const DEMO_VALUE_KEYS: Record<string, UiTextKey> = {
  // Ism o'rnidagi rol nomi
  "O'qituvchi": 'profile.demoStaffName',
  'Admin': 'profile.demoAdminName',
  // Fakultet
  'Tibbiyot fakulteti': 'profile.demoFacultyMedical',
  'Administrator': 'profile.demoFacultyAdmin',
  // Kafedra
  'Ichki kasalliklar kafedrasi': 'profile.demoDeptInternal',
  'Tizim': 'profile.demoDeptSystem',
  // Yo'nalish
  "Terapiya yo'nalishi": 'profile.demoDirectionTherapy',
  "To'liq kirish": 'profile.demoDirectionFullAccess',
};

/** Demo konstantasi bo'lsa tarjimasini, aks holda asl qiymatni qaytaradi. */
export function localizedProfileValue(
  value: string | null | undefined,
  t: (key: UiTextKey) => string,
): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  const key = DEMO_VALUE_KEYS[raw];
  return key ? t(key) : raw;
}
