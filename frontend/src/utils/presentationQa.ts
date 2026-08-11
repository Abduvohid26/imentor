import {
  MAX_BULLETS,
  MAX_WORDS_PER_BULLET,
  MIN_WORDS_PER_BULLET,
  type PresentationContent,
  wordCount,
} from './presentationContentSchema';

export type PresentationQaIssue = {
  slideIndex: number;
  code:
    | 'too_many_bullets'
    | 'bullet_too_long'
    | 'bullet_too_short'
    | 'empty_title'
    | 'missing_image_query';
  message: string;
};

export function qaPresentationContent(content: PresentationContent): PresentationQaIssue[] {
  const issues: PresentationQaIssue[] = [];
  content.slides.forEach((slide, slideIndex) => {
    if (!slide.title.trim()) {
      issues.push({
        slideIndex,
        code: 'empty_title',
        message: `Slayd ${slideIndex + 1}: bo'sh sarlavha`,
      });
    }
    const bullets = slide.body.bullets || [];
    if (bullets.length > MAX_BULLETS) {
      issues.push({
        slideIndex,
        code: 'too_many_bullets',
        message: `Slayd ${slideIndex + 1}: ${bullets.length} bullet (max ${MAX_BULLETS})`,
      });
    }
    bullets.forEach((b, bi) => {
      const n = wordCount(b);
      if (n > MAX_WORDS_PER_BULLET) {
        issues.push({
          slideIndex,
          code: 'bullet_too_long',
          message: `Slayd ${slideIndex + 1} bullet ${bi + 1}: ${n} so'z (max ${MAX_WORDS_PER_BULLET})`,
        });
      } else if (
        n > 0 &&
        n < MIN_WORDS_PER_BULLET &&
        !['agenda', 'title', 'statistics', 'quote'].includes(slide.slide_type)
      ) {
        issues.push({
          slideIndex,
          code: 'bullet_too_short',
          message: `Slayd ${slideIndex + 1} bullet ${bi + 1}: ${n} so'z (min ${MIN_WORDS_PER_BULLET})`,
        });
      }
    });
    const needsImage = ['content_bullets', 'image_focus', 'two_column', 'case_study'].includes(
      slide.slide_type,
    );
    if (needsImage && !slide.image_query?.trim() && !slide.imageUrl) {
      issues.push({
        slideIndex,
        code: 'missing_image_query',
        message: `Slayd ${slideIndex + 1}: image_query yo'q`,
      });
    }
  });
  if (issues.length) {
    console.warn('[presentationQa]', issues);
  }
  return issues;
}

function normalizeForCompare(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Slaydning mazmun "barmoq izi" — sarlavha + bulletlar + asosiy matn. */
function slideFingerprint(slide: PresentationContent['slides'][number]): string {
  const body = slide.body || {};
  const parts = [
    slide.title,
    slide.subtitle || '',
    ...(body.bullets || []),
    body.key_stat ? `${body.key_stat.number} ${body.key_stat.label}` : '',
    body.quote_text || '',
    ...(body.process_steps || []).map((s) => `${s.label} ${s.description}`),
  ];
  return normalizeForCompare(parts.join(' | '));
}

/** Ikki matnning so'zlar bo'yicha o'xshashligi (Jaccard, 0…1). */
function similarity(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter((w) => w.length > 3));
  const setB = new Set(b.split(' ').filter((w) => w.length > 3));
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter += 1;
  return inter / (setA.size + setB.size - inter);
}

/** Shu chegaradan yuqori o'xshashlik — aynan bir xil emas, lekin takror. */
const NEAR_DUPLICATE_RATIO = 0.8;
/** Bitta bullet takror hisoblanadigan chegara. */
const DUPLICATE_BULLET_RATIO = 0.75;

/** Bu turlarda bullet takrori tabiiy (reja/xulosa butun taqdimotni qaytaradi). */
const BULLET_DEDUPE_EXEMPT = ['agenda', 'summary', 'title'];

/**
 * Takrorlangan slaydlarni olib tashlaydi.
 *
 * Model uzun ma'ruzani slaydlarga bo'lganda ba'zan bir xil slaydni bir necha
 * marta qaytaradi — taqdimotda bir sahifa qayta-qayta ko'rinadi. Birinchi
 * nusxa saqlanadi, qolganlari tashlanadi. Xulosa (summary) slaydi esa faqat
 * bitta va eng oxirida bo'ladi.
 *
 * Aynan mos nusxadan tashqari uch xil takror tutiladi:
 *  - bir xil (normallashtirilgan) SARLAVHA;
 *  - so'zlarining 80% i ustma-ust tushadigan YAQIN nusxa;
 *  - boshqa slaydda aytilgan BULLET ning qayta ishlatilishi.
 * Bulletlari butunlay takror bo'lib qolgan slayd ham tashlanadi.
 */
export function dedupePresentationSlides(content: PresentationContent): PresentationContent {
  const seen = new Set<string>();
  const seenTitles = new Set<string>();
  const fingerprints: string[] = [];
  const seenBullets: string[] = [];
  const kept: PresentationContent['slides'] = [];
  const dropped: number[] = [];

  content.slides.forEach((slide, idx) => {
    const fp = slideFingerprint(slide);
    const titleKey = normalizeForCompare(slide.title);
    // Mazmuni bo'sh slaydlar (masalan title) barmoq izi bo'yicha tekshirilmaydi.
    if (fp && seen.has(fp)) {
      dropped.push(idx + 1);
      return;
    }
    if (titleKey && slide.slide_type !== 'title' && seenTitles.has(titleKey)) {
      dropped.push(idx + 1);
      return;
    }
    if (fp && fingerprints.some((prev) => similarity(prev, fp) >= NEAR_DUPLICATE_RATIO)) {
      dropped.push(idx + 1);
      return;
    }

    let next = slide;
    const bullets = slide.body.bullets || [];
    if (bullets.length && !BULLET_DEDUPE_EXEMPT.includes(slide.slide_type)) {
      const fresh = bullets.filter((b) => {
        const key = normalizeForCompare(b);
        if (!key) return false;
        if (seenBullets.some((prev) => similarity(prev, key) >= DUPLICATE_BULLET_RATIO)) {
          return false;
        }
        seenBullets.push(key);
        return true;
      });
      // Hamma bulleti takror bo'lsa va boshqa mazmuni (jadval, statistika,
      // sxema) ham bo'lmasa — slaydda yangi ma'lumot qolmaydi.
      const b = slide.body;
      const hasOtherContent = Boolean(
        b.stats?.length ||
          b.key_stat ||
          b.columns?.length ||
          b.comparison_rows?.length ||
          b.process_steps?.length ||
          b.quote_text,
      );
      if (!fresh.length && !hasOtherContent) {
        dropped.push(idx + 1);
        return;
      }
      if (fresh.length !== bullets.length) {
        next = { ...slide, body: { ...slide.body, bullets: fresh } };
      }
    }

    if (fp) {
      seen.add(fp);
      fingerprints.push(fp);
    }
    if (titleKey) seenTitles.add(titleKey);
    kept.push(next);
  });

  // Xulosa slaydi: oxirgisini qoldirib, qolganlarini olib tashlaymiz.
  const summaryIdxs = kept
    .map((s, i) => (s.slide_type === 'summary' ? i : -1))
    .filter((i) => i >= 0);
  let slides = kept;
  if (summaryIdxs.length > 0) {
    const lastSummaryIdx = summaryIdxs[summaryIdxs.length - 1];
    const summary = kept[lastSummaryIdx];
    slides = kept.filter((s) => s.slide_type !== 'summary');
    slides.push(summary);
  }

  if (dropped.length) {
    console.warn('[presentationQa] takroriy slaydlar olib tashlandi:', dropped);
  }
  return { ...content, slides };
}

/** Matn uzunligiga qarab shrift o'lchamini kichraytirish */
export function autofitFontSize(
  text: string,
  opts: { base: number; min: number; softMaxChars: number },
): number {
  const len = text.trim().length;
  if (len <= opts.softMaxChars) return opts.base;
  const over = len / opts.softMaxChars;
  const size = Math.round(opts.base / Math.min(over, 1.8));
  return Math.max(opts.min, size);
}
