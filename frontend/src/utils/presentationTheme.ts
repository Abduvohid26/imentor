/** Design tokens — LLM bu qatlamga aralashmaydi. */

export const THEME = {
  colors: {
    primary: '0F4C81',
    secondary: '2E9E9E',
    accent: 'F2A93B',
    textDark: '1A1A1A',
    textLight: 'FFFFFF',
    bgLight: 'F7F9FB',
    bgDark: '0F1B2B',
    muted: '5B6B7A',
    card: 'FFFFFF',
    zebra: 'E8EEF4',
    soft: 'D6EAF5',
  },
  fonts: {
    // OS’da Montserrat/Inter bo‘lmasa Calibri/Arial ishonchli.
    heading: 'Calibri',
    body: 'Calibri',
  },
  spacing: {
    margin: 0.55,
    gutter: 0.28,
  },
  slide: {
    w: 13.333,
    h: 7.5,
  },
} as const;

export type PresentationBuildMeta = {
  subjectName: string;
  topicId: string;
  variantLabel?: string;
  /** Layout ichidagi qat'iy yozuvlar (jadval sarlavhasi va h.k.) shu tilda. */
  language?: 'uz' | 'ru' | 'en';
};

/** Design Layer'ning o'z yozuvlari — AI matniga aloqasi yo'q. */
const BUILD_LABELS = {
  uz: { criteria: 'Mezon', left: 'A variant', right: 'B variant', caseStudy: 'Klinik holat' },
  ru: { criteria: 'Критерий', left: 'Вариант A', right: 'Вариант B', caseStudy: 'Клинический случай' },
  en: { criteria: 'Criterion', left: 'Option A', right: 'Option B', caseStudy: 'Case study' },
} as const;

export function buildLabels(meta: PresentationBuildMeta) {
  return BUILD_LABELS[meta.language || 'uz'] || BUILD_LABELS.uz;
}
