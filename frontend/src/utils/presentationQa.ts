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
