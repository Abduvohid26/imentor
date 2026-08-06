/**
 * Design Layer — slide_type bo‘yicha professional shablonlar (PptxGenJS).
 * Content Layer natijasi: PresentationContent.
 */
import {
  type ContentSlide,
  type PresentationContent,
  coercePresentationContent,
  slidePreviewBullets,
} from './presentationContentSchema';
import { autofitFontSize } from './presentationQa';
import { THEME, type PresentationBuildMeta } from './presentationTheme';

export type { PresentationContent, ContentSlide };
export type PresentationDeck = PresentationContent;
export type PresentationSlide = ContentSlide;

type PptxSlide = import('pptxgenjs').default.Slide;

const C = THEME.colors;
const F = THEME.fonts;
const M = THEME.spacing.margin;

function badgeLabel(meta: PresentationBuildMeta): string {
  const variant = meta.variantLabel?.trim();
  const subj = meta.subjectName.trim().slice(0, 40);
  const code = meta.topicId.trim().slice(0, 12);
  return variant ? `${subj}(${variant}) · ${code}` : `${subj} · ${code}`;
}

function addHeaderBadge(s: PptxSlide, meta: PresentationBuildMeta, dark = false): void {
  const label = badgeLabel(meta);
  s.addShape('roundRect', {
    x: M,
    y: 0.22,
    w: Math.min(5.8, 0.12 * label.length + 1.2),
    h: 0.34,
    fill: { color: dark ? C.secondary : C.primary },
    line: { type: 'none' },
  });
  s.addText(label, {
    x: M + 0.1,
    y: 0.22,
    w: 5.5,
    h: 0.34,
    fontSize: 10,
    bold: true,
    color: C.textLight,
    fontFace: F.body,
    valign: 'middle',
  });
}

function addFooter(
  s: PptxSlide,
  title: string,
  pageNum: number,
  total: number,
  dark = false,
): void {
  const y = 7.1;
  s.addText(title.slice(0, 70), {
    x: M,
    y,
    w: 10.5,
    h: 0.28,
    fontSize: 9,
    color: dark ? 'A8B8C8' : C.muted,
    fontFace: F.body,
  });
  s.addText(`${pageNum} / ${total}`, {
    x: 11.6,
    y,
    w: 1.2,
    h: 0.28,
    fontSize: 9,
    color: dark ? 'A8B8C8' : C.muted,
    align: 'right',
    fontFace: F.body,
  });
}

/** Toza tibbiy ikonka paneli — ma'nosiz geometrik "art" emas. */
function addMedicalIconPanel(
  s: PptxSlide,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  s.addShape('roundRect', {
    x,
    y,
    w,
    h,
    fill: { color: C.soft },
    line: { color: C.secondary, width: 1 },
  });
  const cx = x + w / 2;
  const cy = y + h / 2 - 0.15;
  const arm = Math.min(w, h) * 0.12;
  // Tibbiy xoch
  s.addShape('roundRect', {
    x: cx - arm * 0.35,
    y: cy - arm * 1.6,
    w: arm * 0.7,
    h: arm * 3.2,
    fill: { color: C.primary },
    line: { type: 'none' },
  });
  s.addShape('roundRect', {
    x: cx - arm * 1.6,
    y: cy - arm * 0.35,
    w: arm * 3.2,
    h: arm * 0.7,
    fill: { color: C.primary },
    line: { type: 'none' },
  });
  s.addText('Tibbiy illustratsiya', {
    x: x + 0.2,
    y: y + h - 0.55,
    w: w - 0.4,
    h: 0.35,
    fontSize: 11,
    color: C.muted,
    align: 'center',
    fontFace: F.body,
  });
}

/** Rasm bo‘lsa qo‘yadi; bo‘lmasa — toza tibbiy ikonka (abstrakt shakllar yo‘q). */
function addImageOrMedicalIcon(
  s: PptxSlide,
  slide: ContentSlide,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  if (slide.imageUrl) {
    try {
      s.addImage({
        data: slide.imageUrl,
        x,
        y,
        w,
        h,
        sizing: { type: 'cover', w, h },
      });
      if (slide.imageCredit) {
        s.addText(slide.imageCredit.slice(0, 100), {
          x,
          y: y + h - 0.28,
          w,
          h: 0.26,
          fontSize: 7,
          color: C.muted,
          italic: true,
        });
      }
      return true;
    } catch {
      /* icon fallback */
    }
  }
  addMedicalIconPanel(s, x, y, w, h);
  return false;
}

function addNumberedBullets(
  s: PptxSlide,
  bullets: string[],
  box: { x: number; y: number; w: number; h: number },
): void {
  const items = bullets.slice(0, 5);
  if (!items.length) return;
  // Bo‘sh joy qolmasin: kam bullet → kattaroq qator balandligi va shrift
  const rowH = Math.min(1.35, Math.max(0.95, box.h / items.length));
  const baseFs = items.length <= 3 ? 16 : items.length === 4 ? 15 : 14;
  items.forEach((text, i) => {
    const y = box.y + i * rowH;
    if (y + 0.4 > box.y + box.h) return;
    s.addShape('ellipse', {
      x: box.x,
      y: y + 0.12,
      w: 0.4,
      h: 0.4,
      fill: { color: C.primary },
      line: { type: 'none' },
    });
    s.addText(String(i + 1), {
      x: box.x,
      y: y + 0.12,
      w: 0.4,
      h: 0.4,
      fontSize: 13,
      bold: true,
      color: C.textLight,
      align: 'center',
      valign: 'middle',
    });
    const fs = autofitFontSize(text, {
      base: baseFs,
      min: 12,
      softMaxChars: 140,
    });
    s.addText(text, {
      x: box.x + 0.55,
      y: y + 0.06,
      w: box.w - 0.6,
      h: rowH - 0.12,
      fontSize: fs,
      color: C.textDark,
      fontFace: F.body,
      valign: 'top',
    });
  });
}

/* ---------- per-type layouts ---------- */

function layoutTitle(
  s: PptxSlide,
  slide: ContentSlide,
  meta: PresentationBuildMeta,
  deckTitle: string,
  page: number,
  total: number,
): void {
  // Yaxlit bitta fon — ikkinchi "bo‘lak" band yo‘q (BUG 1).
  s.background = { color: C.bgDark };
  addHeaderBadge(s, meta, true);
  s.addText('iMentor', {
    x: 10.8,
    y: 0.25,
    w: 2.0,
    h: 0.35,
    fontSize: 14,
    bold: true,
    color: C.accent,
    align: 'right',
    fontFace: F.heading,
  });
  // Yupqa aksent chiziq (fon emas)
  s.addShape('rect', {
    x: M,
    y: 2.15,
    w: 1.8,
    h: 0.07,
    fill: { color: C.accent },
    line: { type: 'none' },
  });
  const titleFs = autofitFontSize(slide.title, { base: 36, min: 22, softMaxChars: 48 });
  s.addText(slide.title, {
    x: M,
    y: 2.4,
    w: 12.2,
    h: 1.5,
    fontSize: titleFs,
    bold: true,
    color: C.textLight,
    fontFace: F.heading,
  });
  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: M,
      y: 4.1,
      w: 12.2,
      h: 0.55,
      fontSize: 17,
      color: 'B8C8D8',
      fontFace: F.body,
    });
  }
  addFooter(s, deckTitle, page, total, true);
}

function layoutAgenda(
  s: PptxSlide,
  slide: ContentSlide,
  meta: PresentationBuildMeta,
  deckTitle: string,
  page: number,
  total: number,
): void {
  s.background = { color: C.bgLight };
  addHeaderBadge(s, meta);
  s.addText(slide.title, {
    x: M,
    y: 0.7,
    w: 12.2,
    h: 0.55,
    fontSize: 26,
    bold: true,
    color: C.primary,
    fontFace: F.heading,
  });
  const bullets = slidePreviewBullets(slide).slice(0, 6);
  const startY = 1.5;
  const rowH = 0.78;
  bullets.forEach((b, i) => {
    const y = startY + i * rowH;
    s.addShape('roundRect', {
      x: M,
      y,
      w: 12.2,
      h: 0.68,
      fill: { color: C.card },
      line: { color: C.soft, width: 1 },
    });
    s.addShape('ellipse', {
      x: M + 0.18,
      y: y + 0.12,
      w: 0.44,
      h: 0.44,
      fill: { color: i % 2 === 0 ? C.primary : C.secondary },
      line: { type: 'none' },
    });
    s.addText(String(i + 1), {
      x: M + 0.18,
      y: y + 0.12,
      w: 0.44,
      h: 0.44,
      fontSize: 14,
      bold: true,
      color: C.textLight,
      align: 'center',
      valign: 'middle',
    });
    s.addText(b, {
      x: M + 0.85,
      y: y + 0.12,
      w: 11.1,
      h: 0.44,
      fontSize: 16,
      color: C.textDark,
      valign: 'middle',
      fontFace: F.body,
    });
  });
  addFooter(s, deckTitle, page, total);
}

function layoutContentBullets(
  s: PptxSlide,
  slide: ContentSlide,
  meta: PresentationBuildMeta,
  deckTitle: string,
  page: number,
  total: number,
): void {
  s.background = { color: C.bgLight };
  addHeaderBadge(s, meta);
  const hasImage = Boolean(slide.imageUrl);
  const titleW = hasImage ? 7.2 : 12.2;
  s.addText(slide.title, {
    x: M,
    y: 0.7,
    w: titleW,
    h: 0.55,
    fontSize: autofitFontSize(slide.title, { base: 22, min: 14, softMaxChars: 40 }),
    bold: true,
    color: C.primary,
    fontFace: F.heading,
  });
  addNumberedBullets(s, slide.body.bullets || slidePreviewBullets(slide), {
    x: M,
    y: 1.4,
    w: hasImage ? 6.8 : 12.2,
    h: 5.25,
  });
  if (hasImage) {
    addImageOrMedicalIcon(s, slide, 7.7, 0.85, 5.0, 5.7);
  }
  addFooter(s, deckTitle, page, total);
}

function layoutTwoColumn(
  s: PptxSlide,
  slide: ContentSlide,
  meta: PresentationBuildMeta,
  deckTitle: string,
  page: number,
  total: number,
): void {
  s.background = { color: C.bgLight };
  addHeaderBadge(s, meta);
  s.addText(slide.title, {
    x: M,
    y: 0.7,
    w: 12.2,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: C.primary,
    fontFace: F.heading,
  });
  const cols = slide.body.columns?.length
    ? slide.body.columns.slice(0, 2)
    : [
        { heading: 'A', points: (slide.body.bullets || []).slice(0, 3) },
        { heading: 'B', points: (slide.body.bullets || []).slice(3, 5) },
      ];
  cols.forEach((col, i) => {
    const x = M + i * (5.9 + THEME.spacing.gutter);
    s.addShape('roundRect', {
      x,
      y: 1.4,
      w: 5.9,
      h: 5.1,
      fill: { color: C.card },
      line: { color: C.soft, width: 1 },
    });
    s.addShape('rect', {
      x,
      y: 1.4,
      w: 5.9,
      h: 0.55,
      fill: { color: i === 0 ? C.primary : C.secondary },
      line: { type: 'none' },
    });
    s.addText(col.heading, {
      x: x + 0.2,
      y: 1.45,
      w: 5.5,
      h: 0.45,
      fontSize: 16,
      bold: true,
      color: C.textLight,
      fontFace: F.heading,
    });
    addNumberedBullets(s, col.points || [], { x: x + 0.2, y: 2.2, w: 5.5, h: 4.0 });
  });
  addFooter(s, deckTitle, page, total);
}

function layoutImageFocus(
  s: PptxSlide,
  slide: ContentSlide,
  meta: PresentationBuildMeta,
  deckTitle: string,
  page: number,
  total: number,
): void {
  // Rasm yo‘q bo‘lsa demote allaqachon content_bullets qiladi; shu yerda rasm yoki ikonka.
  s.background = { color: C.bgLight };
  addHeaderBadge(s, meta);
  addImageOrMedicalIcon(s, slide, M, 0.75, 7.4, 5.9);
  s.addText(slide.title, {
    x: 8.2,
    y: 0.85,
    w: 4.5,
    h: 0.9,
    fontSize: autofitFontSize(slide.title, { base: 20, min: 13, softMaxChars: 36 }),
    bold: true,
    color: C.primary,
    fontFace: F.heading,
  });
  addNumberedBullets(s, slide.body.bullets || slidePreviewBullets(slide), {
    x: 8.2,
    y: 2.0,
    w: 4.5,
    h: 4.4,
  });
  addFooter(s, deckTitle, page, total);
}

function layoutStatistics(
  s: PptxSlide,
  slide: ContentSlide,
  meta: PresentationBuildMeta,
  deckTitle: string,
  page: number,
  total: number,
): void {
  s.background = { color: C.bgLight };
  addHeaderBadge(s, meta);
  s.addText(slide.title, {
    x: M,
    y: 0.7,
    w: 12.2,
    h: 0.5,
    fontSize: 24,
    bold: true,
    color: C.primary,
    fontFace: F.heading,
  });
  const stats =
    slide.body.stats?.length
      ? slide.body.stats.slice(0, 4)
      : slide.body.key_stat
        ? [slide.body.key_stat]
        : (slide.body.bullets || []).slice(0, 3).map((b) => ({ number: '—', label: b }));
  const n = Math.max(stats.length, 1);
  const gap = THEME.spacing.gutter;
  const cardW = (12.2 - gap * (n - 1)) / n;
  stats.forEach((st, i) => {
    const x = M + i * (cardW + gap);
    s.addShape('roundRect', {
      x,
      y: 2.0,
      w: cardW,
      h: 3.6,
      fill: { color: C.card },
      line: { color: C.soft, width: 1 },
    });
    s.addText(st.number, {
      x: x + 0.15,
      y: 2.5,
      w: cardW - 0.3,
      h: 1.4,
      fontSize: 48,
      bold: true,
      color: C.accent,
      align: 'center',
      fontFace: F.heading,
    });
    s.addText(st.label, {
      x: x + 0.2,
      y: 4.2,
      w: cardW - 0.4,
      h: 0.9,
      fontSize: 14,
      color: C.textDark,
      align: 'center',
      fontFace: F.body,
    });
  });
  addFooter(s, deckTitle, page, total);
}

function layoutComparison(
  s: PptxSlide,
  slide: ContentSlide,
  meta: PresentationBuildMeta,
  deckTitle: string,
  page: number,
  total: number,
): void {
  s.background = { color: C.bgLight };
  addHeaderBadge(s, meta);
  s.addText(slide.title, {
    x: M,
    y: 0.7,
    w: 12.2,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: C.primary,
    fontFace: F.heading,
  });
  const rows = slide.body.comparison_rows?.length
    ? slide.body.comparison_rows
    : [
        { criteria: 'Mezon', left: 'A', right: 'B' },
        ...(slide.body.bullets || []).slice(0, 3).map((b) => ({
          criteria: b,
          left: '—',
          right: '—',
        })),
      ];
  const tableRows = [
    [
      { text: 'Mezon', options: { bold: true, color: C.textLight, fill: { color: C.primary } } },
      { text: 'Chap', options: { bold: true, color: C.textLight, fill: { color: C.primary } } },
      { text: 'Oʻng', options: { bold: true, color: C.textLight, fill: { color: C.primary } } },
    ],
    ...rows.map((r, i) => {
      const fill = i % 2 === 0 ? C.card : C.zebra;
      return [
        { text: r.criteria, options: { fill: { color: fill }, color: C.textDark } },
        { text: r.left, options: { fill: { color: fill }, color: C.textDark } },
        { text: r.right, options: { fill: { color: fill }, color: C.textDark } },
      ];
    }),
  ];
  const border = { pt: 0.5, color: C.soft };
  s.addTable(tableRows as never, {
    x: M,
    y: 1.45,
    w: 12.2,
    colW: [4.0, 4.1, 4.1],
    border: [border, border, border, border],
    fontFace: F.body,
    fontSize: 13,
    valign: 'middle',
  });
  addFooter(s, deckTitle, page, total);
}

function layoutProcess(
  s: PptxSlide,
  slide: ContentSlide,
  meta: PresentationBuildMeta,
  deckTitle: string,
  page: number,
  total: number,
): void {
  s.background = { color: C.bgLight };
  addHeaderBadge(s, meta);
  s.addText(slide.title, {
    x: M,
    y: 0.7,
    w: 12.2,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: C.primary,
    fontFace: F.heading,
  });
  const steps = slide.body.process_steps?.length
    ? slide.body.process_steps.slice(0, 5)
    : (slide.body.bullets || []).slice(0, 4).map((b, i) => ({
        step_number: i + 1,
        label: b.slice(0, 24),
        description: '',
      }));
  const n = steps.length;
  const usable = 12.2;
  const stepW = usable / n;
  steps.forEach((step, i) => {
    const cx = M + i * stepW + stepW / 2;
    s.addShape('ellipse', {
      x: cx - 0.4,
      y: 2.2,
      w: 0.8,
      h: 0.8,
      fill: { color: C.secondary },
      line: { type: 'none' },
    });
    s.addText(String(step.step_number || i + 1), {
      x: cx - 0.4,
      y: 2.2,
      w: 0.8,
      h: 0.8,
      fontSize: 20,
      bold: true,
      color: C.textLight,
      align: 'center',
      valign: 'middle',
    });
    if (i < n - 1) {
      s.addShape('rightArrow', {
        x: cx + 0.5,
        y: 2.45,
        w: Math.max(0.4, stepW - 1.1),
        h: 0.3,
        fill: { color: C.accent },
        line: { type: 'none' },
      });
    }
    s.addText(step.label, {
      x: M + i * stepW + 0.1,
      y: 3.3,
      w: stepW - 0.2,
      h: 0.6,
      fontSize: 13,
      bold: true,
      color: C.textDark,
      align: 'center',
      fontFace: F.heading,
    });
    if (step.description) {
      s.addText(step.description, {
        x: M + i * stepW + 0.1,
        y: 3.95,
        w: stepW - 0.2,
        h: 1.4,
        fontSize: 12,
        color: C.muted,
        align: 'center',
        fontFace: F.body,
      });
    }
  });
  addFooter(s, deckTitle, page, total);
}

function layoutQuote(
  s: PptxSlide,
  slide: ContentSlide,
  meta: PresentationBuildMeta,
  deckTitle: string,
  page: number,
  total: number,
): void {
  s.background = { color: C.bgLight };
  addHeaderBadge(s, meta);
  s.addText('“', {
    x: M,
    y: 1.4,
    w: 1.5,
    h: 1.2,
    fontSize: 96,
    color: C.accent,
    fontFace: F.heading,
  });
  const quote = slide.body.quote_text || slidePreviewBullets(slide).join(' ');
  s.addText(quote, {
    x: M + 0.8,
    y: 2.4,
    w: 11.0,
    h: 2.4,
    fontSize: autofitFontSize(quote, { base: 22, min: 14, softMaxChars: 120 }),
    italic: true,
    color: C.textDark,
    fontFace: F.body,
  });
  s.addShape('rect', {
    x: M + 0.8,
    y: 5.1,
    w: 2.2,
    h: 0.06,
    fill: { color: C.primary },
    line: { type: 'none' },
  });
  s.addText(slide.body.quote_author || slide.subtitle || '', {
    x: M + 0.8,
    y: 5.3,
    w: 10,
    h: 0.4,
    fontSize: 14,
    color: C.muted,
    fontFace: F.body,
  });
  addFooter(s, deckTitle, page, total);
}

function layoutCaseStudy(
  s: PptxSlide,
  slide: ContentSlide,
  meta: PresentationBuildMeta,
  deckTitle: string,
  page: number,
  total: number,
): void {
  s.background = { color: C.bgLight };
  addHeaderBadge(s, meta);
  const hasImage = Boolean(slide.imageUrl);
  const cardW = hasImage ? 7.0 : 12.2;
  s.addText(slide.title, {
    x: M,
    y: 0.7,
    w: cardW,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: C.primary,
    fontFace: F.heading,
  });
  s.addShape('roundRect', {
    x: M,
    y: 1.35,
    w: cardW,
    h: 5.15,
    fill: { color: C.card },
    line: { color: C.soft, width: 1 },
  });
  // Ichki dublikat sarlavha YO‘Q — faqat type badge (BUG 3)
  s.addText('Case study', {
    x: M + 0.25,
    y: 1.5,
    w: 2.2,
    h: 0.3,
    fontSize: 11,
    bold: true,
    color: C.secondary,
    fontFace: F.body,
  });
  addNumberedBullets(s, slide.body.bullets || slidePreviewBullets(slide), {
    x: M + 0.25,
    y: 1.95,
    w: cardW - 0.5,
    h: 4.3,
  });
  if (hasImage) {
    addImageOrMedicalIcon(s, slide, 8.0, 1.35, 4.7, 5.15);
  }
  addFooter(s, deckTitle, page, total);
}

function layoutSummary(
  s: PptxSlide,
  slide: ContentSlide,
  meta: PresentationBuildMeta,
  deckTitle: string,
  page: number,
  total: number,
): void {
  s.background = { color: C.bgLight };
  addHeaderBadge(s, meta);
  s.addText(slide.title, {
    x: M,
    y: 0.7,
    w: 12.2,
    h: 0.5,
    fontSize: 26,
    bold: true,
    color: C.primary,
    fontFace: F.heading,
  });
  const bullets = slidePreviewBullets(slide).slice(0, 5);
  const rowH = Math.min(1.15, 5.4 / Math.max(bullets.length, 1));
  bullets.forEach((b, i) => {
    const y = 1.4 + i * rowH;
    const split = b.match(/^([^:—–-]{4,48})[:—–-]\s*(.+)$/);
    const head = split ? split[1].trim() : b.slice(0, 48);
    const tail = split ? split[2].trim() : '';
    s.addText(`${i + 1}.`, {
      x: M,
      y,
      w: 0.45,
      h: 0.4,
      fontSize: 18,
      bold: true,
      color: C.accent,
      fontFace: F.heading,
    });
    s.addText(head, {
      x: M + 0.55,
      y,
      w: 11.6,
      h: 0.35,
      fontSize: 16,
      bold: true,
      color: C.textDark,
      fontFace: F.heading,
    });
    s.addText(tail || b, {
      x: M + 0.55,
      y: y + 0.35,
      w: 11.6,
      h: rowH - 0.42,
      fontSize: 13,
      color: C.muted,
      fontFace: F.body,
      valign: 'top',
    });
  });
  addFooter(s, deckTitle, page, total);
}

function renderSlide(
  s: PptxSlide,
  slide: ContentSlide,
  meta: PresentationBuildMeta,
  deckTitle: string,
  page: number,
  total: number,
): void {
  switch (slide.slide_type) {
    case 'title':
      layoutTitle(s, slide, meta, deckTitle, page, total);
      break;
    case 'agenda':
      layoutAgenda(s, slide, meta, deckTitle, page, total);
      break;
    case 'content_bullets':
      layoutContentBullets(s, slide, meta, deckTitle, page, total);
      break;
    case 'two_column':
      layoutTwoColumn(s, slide, meta, deckTitle, page, total);
      break;
    case 'image_focus':
      layoutImageFocus(s, slide, meta, deckTitle, page, total);
      break;
    case 'statistics':
      layoutStatistics(s, slide, meta, deckTitle, page, total);
      break;
    case 'comparison_table':
      layoutComparison(s, slide, meta, deckTitle, page, total);
      break;
    case 'process_flow':
      layoutProcess(s, slide, meta, deckTitle, page, total);
      break;
    case 'quote':
      layoutQuote(s, slide, meta, deckTitle, page, total);
      break;
    case 'case_study':
      layoutCaseStudy(s, slide, meta, deckTitle, page, total);
      break;
    case 'summary':
    case 'references':
      layoutSummary(s, slide, meta, deckTitle, page, total);
      break;
    default:
      layoutContentBullets(s, slide, meta, deckTitle, page, total);
  }
}

export type BuildPresentationOptions = {
  meta?: PresentationBuildMeta;
};

export async function buildPresentationPptxFile(
  deck: PresentationContent | { title?: string; slides?: unknown[] },
  options?: BuildPresentationOptions,
): Promise<File> {
  const content =
    deck && typeof deck === 'object' && 'presentation_title' in deck
      ? (deck as PresentationContent)
      : coercePresentationContent(deck, {
          title: (deck as { title?: string })?.title || 'Taqdimot',
          subject: options?.meta?.subjectName || '',
        });

  const meta: PresentationBuildMeta = options?.meta || {
    subjectName: content.subject_area || 'Fan',
    topicId: 'T',
  };

  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.author = content.author || 'iMentor';
  pptx.title = content.presentation_title.slice(0, 120);
  pptx.layout = 'LAYOUT_WIDE';

  const total = content.slides.length;
  content.slides.forEach((slide, idx) => {
    const s = pptx.addSlide();
    renderSlide(s, slide, meta, content.presentation_title, idx + 1, total);
    if (slide.speaker_notes?.trim()) {
      s.addNotes(slide.speaker_notes.trim());
    }
  });

  const blob = (await pptx.write({ outputType: 'blob' })) as Blob;
  const safeName =
    content.presentation_title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().slice(0, 48) ||
    'taqdimot';
  return new File([blob], `${safeName}.pptx`, {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}
