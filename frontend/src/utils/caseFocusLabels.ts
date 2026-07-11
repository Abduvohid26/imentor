import type { AppLanguage } from '../i18n/language';
import { CASE_STUDY_FOCUS_ORDER, type CaseStudyFocus } from './generationVariety';

const LABELS: Record<AppLanguage, Record<CaseStudyFocus, string>> = {
  uz: {
    profilaktika: 'Profilaktika',
    davolash: 'Davolash',
    tashxis: 'Tashxis',
  },
  ru: {
    profilaktika: 'Профилактика',
    davolash: 'Лечение',
    tashxis: 'Диагностика',
  },
  en: {
    profilaktika: 'Prevention',
    davolash: 'Treatment',
    tashxis: 'Diagnosis',
  },
};

const BADGE_CLASS: Record<CaseStudyFocus, string> = {
  profilaktika: 'bg-teal-500/10 text-teal-800 border-teal-500/25',
  davolash: 'bg-blue-500/10 text-blue-800 border-blue-500/25',
  tashxis: 'bg-violet-500/10 text-violet-800 border-violet-500/25',
};

export function caseFocusLabel(focus: CaseStudyFocus | undefined, lang: AppLanguage = 'uz'): string {
  if (!focus) return '';
  return LABELS[lang][focus] || LABELS.uz[focus];
}

export function caseFocusBadgeClass(focus: CaseStudyFocus | undefined): string {
  if (!focus) return 'bg-black/5 text-black/60 border-black/10';
  return BADGE_CLASS[focus];
}

export function normalizeCaseFocus(raw: unknown, index: number): CaseStudyFocus {
  const s = String(raw || '').toLowerCase();
  if (s.includes('profil') || s.includes('prevent') || s.includes('profyl')) return 'profilaktika';
  if (s.includes('davol') || s.includes('lichen') || s.includes('treat') || s.includes('lech')) return 'davolash';
  if (s.includes('tashxis') || s.includes('diagno')) return 'tashxis';
  return CASE_STUDY_FOCUS_ORDER[index] ?? 'tashxis';
}
