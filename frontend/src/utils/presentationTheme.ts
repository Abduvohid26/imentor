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
};
