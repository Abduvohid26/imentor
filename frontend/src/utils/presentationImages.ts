import type { ContentSlide, PresentationContent, SlideType } from './presentationContentSchema';

const IRRELEVANT_IMAGE_HINTS =
  /portrait|photographer|painting|artwork|album cover|logo|flag of|coat of arms|stamp|banknote|coin\b/i;

const IMAGE_TYPES: SlideType[] = [
  'content_bullets',
  'image_focus',
  'two_column',
  'case_study',
];

async function searchOpenImage(query: string): Promise<{ url: string; credit: string } | null> {
  const q = query.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!q) return null;
  try {
    const searchUrl =
      'https://commons.wikimedia.org/w/api.php?action=query&generator=search' +
      `&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=10` +
      '&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=1200&format=json&origin=*';
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title?: string;
            imageinfo?: {
              thumburl?: string;
              url?: string;
              mime?: string;
              extmetadata?: {
                Artist?: { value?: string };
                LicenseShortName?: { value?: string };
                Categories?: { value?: string };
                ObjectName?: { value?: string };
              };
            }[];
          }
        >;
      };
    };
    for (const page of Object.values(data.query?.pages || {})) {
      const info = page.imageinfo?.[0];
      if (!info) continue;
      const mime = info.mime || '';
      if (!mime.startsWith('image/') || mime.includes('svg')) continue;
      const imgUrl = info.thumburl || info.url;
      if (!imgUrl) continue;
      const haystack = `${page.title || ''} ${info.extmetadata?.ObjectName?.value || ''} ${
        info.extmetadata?.Categories?.value || ''
      }`;
      if (IRRELEVANT_IMAGE_HINTS.test(haystack)) continue;
      const license = info.extmetadata?.LicenseShortName?.value || 'Wikimedia Commons';
      const artist = (info.extmetadata?.Artist?.value || '').replace(/<[^>]+>/g, '').trim();
      const credit = artist
        ? `${artist} · ${license} (Wikimedia Commons)`
        : `${license} (Wikimedia Commons)`;
      return { url: imgUrl, credit };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(14000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 3_000) return null;
    if (typeof Buffer !== 'undefined') {
      return `data:${contentType};base64,${Buffer.from(buf).toString('base64')}`;
    }
    const blob = new Blob([buf], { type: contentType });
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('read-failed'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function queriesForSlide(slide: ContentSlide, subjectArea: string): string[] {
  const primary = (slide.image_query || '').trim();
  const title = (slide.title || '').trim();
  const subject = subjectArea.replace(/\s+/g, ' ').trim().slice(0, 40);
  return [
    primary,
    `${primary} diagram`,
    `${primary} anatomy`,
    `${title} medical illustration`,
    `${subject} skin anatomy histology`,
    `${subject} dermatology clinical`,
    'human skin layers epidermis dermis diagram',
    'medical anatomy textbook illustration',
  ].filter((q, i, arr) => q && arr.indexOf(q) === i);
}

/**
 * Rasm topilmasa: image_focus → content_bullets (to‘liq matn layout).
 * Ma'nosiz geometrik "art" chizilmaydi.
 */
export function demoteSlidesWithoutImages(content: PresentationContent): PresentationContent {
  return {
    ...content,
    slides: content.slides.map((slide) => {
      if (slide.imageUrl) return slide;
      if (slide.slide_type === 'image_focus') {
        return { ...slide, slide_type: 'content_bullets' as const };
      }
      return slide;
    }),
  };
}

/** Har kerakli slayd uchun image_query → Wikimedia. */
/** Bir vaqtda nechta slayd uchun rasm qidirilsin (Wikimedia'ni bosmaslik uchun). */
const IMAGE_CONCURRENCY = 5;

export async function resolvePresentationImages(
  content: PresentationContent,
): Promise<PresentationContent> {
  const resolveOne = async (slide: ContentSlide): Promise<ContentSlide> => {
    if (slide.imageUrl?.startsWith('data:')) return slide;
    const tryFetch = IMAGE_TYPES.includes(slide.slide_type) || Boolean(slide.image_query);
    if (!tryFetch) return slide;

    for (const query of queriesForSlide(slide, content.subject_area)) {
      try {
        const found = await searchOpenImage(query);
        if (!found) continue;
        const dataUrl = await fetchImageAsDataUrl(found.url);
        if (!dataUrl) continue;
        return { ...slide, imageUrl: dataUrl, imageCredit: found.credit };
      } catch {
        /* keyingi so'rov */
      }
    }
    return slide;
  };

  // 20-30 slaydda ketma-ket qidirish bir necha daqiqa ketardi — shuning uchun
  // bo'laklab, parallel bajaramiz (slaydlar tartibi saqlanadi).
  const slides: ContentSlide[] = [];
  for (let i = 0; i < content.slides.length; i += IMAGE_CONCURRENCY) {
    const batch = content.slides.slice(i, i + IMAGE_CONCURRENCY);
    slides.push(...(await Promise.all(batch.map(resolveOne))));
  }
  return demoteSlidesWithoutImages({ ...content, slides });
}
