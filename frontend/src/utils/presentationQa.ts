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

/** Bullet uchun taqqoslash kaliti — birinchi 10 so'z (kichik tahrir sezilmasin). */
function bulletKey(text: string): string {
  return normalizeForCompare(text).split(' ').slice(0, 10).join(' ');
}

function tokenSet(text: string): Set<string> {
  return new Set(normalizeForCompare(text).split(' ').filter((w) => w.length > 3));
}

/** Bullet sarlavhaning boshqacha aytilishi bo'lsa — yangi ma'lumot bermaydi. */
function restatesTitle(bullet: string, title: string): boolean {
  const titleTokens = tokenSet(title);
  if (!titleTokens.size) return false;
  const bulletTokens = tokenSet(bullet);
  if (bulletTokens.size < 2) return false;
  let shared = 0;
  titleTokens.forEach((t) => {
    if (bulletTokens.has(t)) shared += 1;
  });
  // Sarlavhaning deyarli hamma so'zi bor va bullet o'zi ham qisqa → tavtologiya.
  // (Mazmunli bullet 15+ so'zdan iborat bo'lishi kerak, ya'ni bu chegaradan
  // ancha uzun — shuning uchun to'g'ri bulletlar tushib qolmaydi.)
  return shared / titleTokens.size >= 0.8 && bulletTokens.size <= titleTokens.size + 4;
}

/**
 * Butun taqdimot bo'ylab TAKRORLANGAN bulletlarni olib tashlaydi.
 *
 * Slayd darajasidagi dedupe yetmaydi: model bir xil jumlani turli slaydlarda
 * qayta ishlatadi (masalan "Quyoshdan himoyalanish … muhimdir." 9- va
 * 16-slaydda) yoki oxirgi bulletda shunchaki sarlavhani qaytaradi.
 */
export function dedupePresentationBullets(content: PresentationContent): PresentationContent {
  const seen = new Set<string>();
  let removed = 0;
  const slides = content.slides.map((slide) => {
    const bullets = slide.body.bullets || [];
    if (!bullets.length) return slide;
    const kept = bullets.filter((b) => {
      const key = bulletKey(b);
      if (!key) return false;
      if (seen.has(key) || restatesTitle(b, slide.title)) {
        removed += 1;
        return false;
      }
      seen.add(key);
      return true;
    });
    // Hammasi olib tashlansa — hech bo'lmasa bittasi qolsin (bo'sh slayd chiqmasin).
    const finalBullets = kept.length ? kept : bullets.slice(0, 1);
    return { ...slide, body: { ...slide.body, bullets: finalBullets } };
  });
  if (removed) {
    console.warn(`[presentationQa] ${removed} ta takroriy/tavtologik bullet olib tashlandi`);
  }
  return { ...content, slides };
}

/**
 * Takrorlangan slaydlarni olib tashlaydi.
 *
 * Model uzun ma'ruzani slaydlarga bo'lganda ba'zan bir xil slaydni bir necha
 * marta qaytaradi — taqdimotda bir sahifa qayta-qayta ko'rinadi. Birinchi
 * nusxa saqlanadi, qolganlari tashlanadi. Xulosa (summary) slaydi esa faqat
 * bitta va eng oxirida bo'ladi.
 */
export function dedupePresentationSlides(content: PresentationContent): PresentationContent {
  const seen = new Set<string>();
  const kept: PresentationContent['slides'] = [];
  const dropped: number[] = [];

  content.slides.forEach((slide, idx) => {
    const fp = slideFingerprint(slide);
    // Mazmuni bo'sh slaydlar (masalan title) barmoq izi bo'yicha tekshirilmaydi.
    if (fp && seen.has(fp)) {
      dropped.push(idx + 1);
      return;
    }
    if (fp) seen.add(fp);
    kept.push(slide);
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
