import type { AppLanguage } from '../i18n/language';
import { translate } from '../i18n/translations';

/** AI (DeepSeek proxy) xatolarini foydalanuvchi tilida ko‘rsatish */
export function messageFromAiError(err: unknown, fallback: string, lang: AppLanguage = 'uz'): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (
    msg === 'no-backend-token' ||
    msg.includes('JWT') ||
    msg.includes('tizimga kirish') ||
    msg.includes('HTTP 401')
  ) {
    return translate(lang, 'ai.error.noToken');
  }
  if (msg.includes('HTTP 403')) {
    return translate(lang, 'ai.error.forbidden');
  }
  if (msg.includes('HTTP 503') || msg.includes('OpenAI') || msg.includes('sozlanmagan')) {
    return translate(lang, 'ai.error.openai');
  }
  if (msg.includes('syllabus-extract-failed') || msg.includes('Syllabusdan') || msg.includes('syllabus') || msg.includes('mavzular ajratib')) {
    return translate(lang, 'ai.error.syllabusExtract');
  }
  return fallback;
}
