export type AppLanguage = 'uz' | 'ru' | 'en';

export const APP_LANGUAGE_STORAGE_KEY = 'imentor-ui-language-v1';

export function getAppLanguage(): AppLanguage {
  try {
    const raw = (localStorage.getItem(APP_LANGUAGE_STORAGE_KEY) || '').trim().toLowerCase();
    if (raw === 'uz' || raw === 'ru' || raw === 'en') return raw;
  } catch {
    // ignore
  }
  return 'uz';
}

export function setAppLanguage(lang: AppLanguage): void {
  try {
    localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // ignore
  }
}

export function localeForLanguage(lang: AppLanguage): string {
  if (lang === 'ru') return 'ru-RU';
  if (lang === 'en') return 'en-US';
  return 'uz-UZ';
}

export function inferPdfLanguage(text: string): AppLanguage {
  const sample = text.slice(0, 8000).toLowerCase();

  const cyr = (sample.match(/[\u0430-\u044f\u0451]/g) || []).length;
  const lat = (sample.match(/[a-z]/g) || []).length;

  const ruHints = [
    '\u043b\u0435\u043a\u0446\u0438\u044f',
    '\u043f\u0440\u0430\u043a\u0442\u0438\u043a\u0430',
    '\u0442\u0435\u043c\u0430',
    '\u0441\u043e\u0434\u0435\u0440\u0436\u0430\u043d\u0438\u0435',
    '\u0434\u0438\u0441\u0446\u0438\u043f\u043b\u0438\u043d\u0430',
  ];
  const enHints = [
    'lecture',
    'practical',
    'topic',
    'syllabus',
    'course',
    'module',
    'semester',
    'anatomy',
    'physiology',
    'pathology',
    'pharmacology',
    'clinical',
    'discipline',
    'curriculum',
    'objectives',
    'assessment',
    'hours',
    'content',
  ];

  const ruScore = ruHints.reduce((acc, w) => acc + (sample.includes(w) ? 2 : 0), 0) + (cyr > lat ? 2 : 0);
  const enScore =
    enHints.reduce((acc, w) => acc + (sample.includes(w) ? 2 : 0), 0) + (lat > cyr + 40 ? 3 : lat > cyr ? 1 : 0);

  if (ruScore >= enScore + 2) return 'ru';
  if (enScore >= ruScore + 2) return 'en';

  const uzHints = ["ma'ruza", 'amaliy', 'mavzu', 'sillabus'];
  const uzScore = uzHints.reduce((acc, w) => acc + (sample.includes(w) ? 2 : 0), 0);
  if (uzScore >= 2) return 'uz';

  return cyr > lat ? 'ru' : 'en';
}

export function languageLabel(lang: AppLanguage): string {
  if (lang === 'ru') return '\u0420\u0443\u0441\u0441\u043a\u0438\u0439';
  if (lang === 'en') return 'English';
  return 'O\'zbek';
}

/** Full language name for AI translation prompts. */
export function aiLanguageName(lang: AppLanguage): string {
  if (lang === 'ru') return 'Russian';
  if (lang === 'en') return 'English';
  return 'Uzbek';
}
