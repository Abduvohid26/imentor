import type { ContentSlide, PresentationContent } from './presentationContentSchema';

const IRRELEVANT_IMAGE_HINTS =
  /portrait|photographer|painting|artwork|album cover|logo|flag of|coat of arms|stamp|banknote|coin\b/i;

async function searchOpenImage(query: string): Promise<{ url: string; credit: string } | null> {
  const q = query.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!q) return null;
  try {
    const searchUrl =
      'https://commons.wikimedia.org/w/api.php?action=query&generator=search' +
      `&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=8` +
      '&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=1200&format=json&origin=*';
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
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
    if (buf.byteLength < 8_000) return null;
    // Browser FileReader yoki Node Buffer
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
  const primary = (slide.image_query || slide.title || '').trim();
  const subject = subjectArea.replace(/\s+/g, ' ').trim().slice(0, 40);
  return [
    primary,
    `${primary} medical diagram`,
    `${subject} ${primary}`.trim(),
    `${subject} clinical medicine`,
  ].filter((q, i, arr) => q && arr.indexOf(q) === i);
}

/** Har slayd uchun image_query → Wikimedia; topilmasa imageUrl bo'sh qoladi (Design Layer placeholder chizadi). */
export async function resolvePresentationImages(
  content: PresentationContent,
): Promise<PresentationContent> {
  const slides: ContentSlide[] = [];
  for (const slide of content.slides) {
    if (slide.imageUrl?.startsWith('data:')) {
      slides.push(slide);
      continue;
    }
    const needsImage = ![
      'title',
      'agenda',
      'statistics',
      'comparison_table',
      'process_flow',
      'quote',
      'summary',
      'references',
    ].includes(slide.slide_type);
    // Title/image_focus ham urinadi
    const tryFetch =
      needsImage ||
      slide.slide_type === 'image_focus' ||
      slide.slide_type === 'content_bullets' ||
      slide.slide_type === 'two_column' ||
      slide.slide_type === 'case_study' ||
      Boolean(slide.image_query);

    if (!tryFetch) {
      slides.push(slide);
      continue;
    }

    let attached = slide;
    for (const query of queriesForSlide(slide, content.subject_area)) {
      try {
        const found = await searchOpenImage(query);
        if (!found) continue;
        const dataUrl = await fetchImageAsDataUrl(found.url);
        if (!dataUrl) continue;
        attached = { ...slide, imageUrl: dataUrl, imageCredit: found.credit };
        break;
      } catch {
        /* next query */
      }
    }
    slides.push(attached);
  }
  return { ...content, slides };
}
