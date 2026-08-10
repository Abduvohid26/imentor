/**
 * AI javobining TILINI tekshirish.
 *
 * Eng ko'p uchraydigan xato: rus tili so'ralganda model o'zbekcha matnni
 * tarjima qilmasdan kirilga TRANSLITERATSIYA qiladi ("Беморнинг исми Лайло,
 * 28 ёшда…"). Bunday matn kirilcha bo'lgani uchun oddiy "kirilmi?" tekshiruvidan
 * o'tib ketardi va foydalanuvchiga rus tili sifatida ko'rsatilardi.
 */
import type { AppLanguage } from '../i18n/language';

/** Lotin yozuvidagi o'zbek matni markerlari. */
const UZ_LATIN_MARKERS = [
  'bemor',
  'yoshli',
  'qaysi',
  'ushbu',
  'hisoblanadi',
  'murojaat',
  'aniqlanadi',
  'tavsiya',
  "bo'lib",
  'shifokorga',
  'davosida',
  'maqbul',
];

/** Kiril yozuvidagi o'zbek matni markerlari (rus tilida uchramaydi). */
const UZ_CYRILLIC_MARKERS = [
  'ёшли',
  'бўлиб',
  'бўлган',
  'қайси',
  'ушбу',
  'билан',
  'ҳисобланади',
  'терисида',
  'касаллиги',
  'аниқланади',
  'кузатилади',
  'мустаҳкам',
  'келди',
];

/** Faqat o'zbek kirilida bor harflar — rus alifbosida yo'q: қ ғ ҳ ў */
const UZ_ONLY_CYRILLIC_LETTERS = /[қҚғҒҳҲўЎ]/;

export function looksLikeUzbekText(text: string): boolean {
  const s = (text || '').toLowerCase();
  if (UZ_LATIN_MARKERS.reduce((n, m) => n + (s.includes(m) ? 1 : 0), 0) >= 2) return true;
  if (UZ_ONLY_CYRILLIC_LETTERS.test(s)) return true;
  return UZ_CYRILLIC_MARKERS.reduce((n, m) => n + (s.includes(m) ? 1 : 0), 0) >= 2;
}

export function cyrillicCharCount(text: string): number {
  let n = 0;
  for (const ch of text || '') {
    const code = ch.charCodeAt(0);
    if (code >= 0x0400 && code <= 0x04ff) n += 1;
  }
  return n;
}

/** Matn so'ralgan tilda EMASLIGINI aniqlaydi (qisqa matnlarda tekshirmaydi). */
export function outputLanguageLooksWrong(text: string, targetLang: AppLanguage): boolean {
  const s = (text || '').trim();
  if (s.length < 40) return false;
  const cyrRatio = cyrillicCharCount(s) / s.length;
  if (targetLang === 'ru') {
    if (looksLikeUzbekText(s)) return true;
    return cyrRatio < 0.25; // rus matni asosan kirilcha bo'lishi kerak
  }
  if (targetLang === 'uz') return cyrRatio > 0.2; // o'zbekcha lotinda yoziladi
  return looksLikeUzbekText(s) || cyrRatio > 0.05; // en
}

function languageName(lang: AppLanguage): string {
  if (lang === 'ru') return 'Russian';
  if (lang === 'en') return 'English';
  return 'Uzbek';
}

/** Modelga chiqish tilini qat'iy belgilaydigan promptga qo'shiladigan ko'rsatma. */
export function strictLanguageDirective(targetLang: AppLanguage): string {
  const base =
    `MAJBURIY TIL: butun javob TO'LIQ ${languageName(targetLang)} tilida bo'lsin. ` +
    'Boshqa tildagi jumla qoldirmang va so\'zlarni boshqa alifboga TRANSLITERATSIYA qilmang. ';
  if (targetLang === 'ru') {
    return (
      base +
      'Bu HAQIQIY rus tibbiy tili bo\'lsin ("Пациентка Лайло, 28 лет, обратилась в клинику…"), ' +
      'kirilcha yozilgan o\'zbek tili EMAS ("Беморнинг исми Лайло, 28 ёшда…"). ' +
      'Matnda қ, ғ, ҳ, ў harflari uchramasin.'
    );
  }
  return base;
}
