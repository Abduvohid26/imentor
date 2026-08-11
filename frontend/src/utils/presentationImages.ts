import type { ContentSlide, PresentationContent, SlideType } from './presentationContentSchema';

const IRRELEVANT_IMAGE_HINTS =
  /portrait|photographer|painting|artwork|album cover|logo|flag of|coat of arms|stamp|banknote|coin\b/i;

const IMAGE_TYPES: SlideType[] = [
  'content_bullets',
  'image_focus',
  'two_column',
  'case_study',
];

/** Qidiruv so'rovi va rasm nomini taqqoslashda hisobga olinmaydigan so'zlar. */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'for', 'with', 'to', 'by',
  'file', 'jpg', 'jpeg', 'png', 'image', 'photo', 'picture', 'svg', 'medical',
  'diagram', 'illustration', 'anatomy', 'clinical', 'textbook', 'human',
]);

function tokens(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

type ImageCandidate = { url: string; credit: string; key: string; score: number };

/**
 * Wikimedia siyosati bo'yicha har so'rov o'zini tanitishi kerak — aks holda
 * anonim so'rovlar tez orada 429 (rate limit) oladi va rasm umuman kelmaydi.
 * Brauzerda `User-Agent` ni o'rnatib bo'lmaydi, `Api-User-Agent` esa ruxsat
 * etilgan va Wikimedia uni tan oladi.
 */
const WIKI_HEADERS = { 'Api-User-Agent': 'iMentor/1.0 (education; presentations)' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 429/503 da qisqa kutib qayta uriladi — Wikimedia tez-tez cheklaydi. */
async function fetchWithRetry(url: string, timeoutMs: number): Promise<Response | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: WIKI_HEADERS,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || res.status === 503) {
        // Wikimedia cheklovi bir necha soniya turadi — qisqa kutish yetmaydi.
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      return res;
    } catch {
      await sleep(400 * (attempt + 1));
    }
  }
  return null;
}

/**
 * Wikimedia'dan bir nechta nomzod qaytaradi (bittasi emas) — chunki yuqoridagi
 * qatlam allaqachon ishlatilgan rasmni tashlab, keyingisiga o'tishi kerak.
 * `score` — so'rov so'zlarining rasm nomi/kategoriyasi bilan mosligi: mavzuga
 * aloqasiz birinchi natija o'rniga eng mos rasm tanlanadi.
 */
async function searchOpenImages(query: string): Promise<ImageCandidate[]> {
  const q = query.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!q) return [];
  const queryTokens = tokens(q);
  try {
    const searchUrl =
      'https://commons.wikimedia.org/w/api.php?action=query&generator=search' +
      `&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=20` +
      '&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=1200&format=json&origin=*';
    const res = await fetchWithRetry(searchUrl, 12000);
    if (!res?.ok) return [];
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
    const out: ImageCandidate[] = [];
    for (const page of Object.values(data.query?.pages || {})) {
      const info = page.imageinfo?.[0];
      if (!info) continue;
      const mime = info.mime || '';
      if (!mime.startsWith('image/')) continue;
      // SVG'ni PPTX o'qiy olmaydi, lekin Wikimedia `thumburl` da uni PNG qilib
      // beradi. Ilgari SVG butunlay rad etilardi — tibbiy diagrammalarning
      // aksariyati aynan SVG bo'lgani uchun eng mos rasmlar tashlab yuborilardi.
      const isSvg = mime.includes('svg');
      const imgUrl = isSvg ? info.thumburl : info.thumburl || info.url;
      if (!imgUrl) continue;
      const haystack = `${page.title || ''} ${info.extmetadata?.ObjectName?.value || ''} ${
        info.extmetadata?.Categories?.value || ''
      }`;
      if (IRRELEVANT_IMAGE_HINTS.test(haystack)) continue;
      // Mavzuga bog'liqlik: so'rovdagi mazmunli so'zlardan kamida bittasi rasm
      // nomi/kategoriyasida uchrasin. Aks holda Wikimedia "eng yaqin" deb
      // butunlay boshqa sohadagi rasmni qaytarib yuborardi.
      const hayTokens = new Set(tokens(haystack));
      const score = queryTokens.filter((w) => hayTokens.has(w)).length;
      if (queryTokens.length && score === 0) continue;
      const license = info.extmetadata?.LicenseShortName?.value || 'Wikimedia Commons';
      const artist = (info.extmetadata?.Artist?.value || '').replace(/<[^>]+>/g, '').trim();
      const credit = artist
        ? `${artist} · ${license} (Wikimedia Commons)`
        : `${license} (Wikimedia Commons)`;
      // Bir xil rasm turli so'rovlarda turli thumb kengligi bilan kelishi
      // mumkin — kalit sifatida fayl nomi ishlatiladi.
      const key = (page.title || imgUrl).toLowerCase().trim();
      out.push({ url: imgUrl, credit, key, score });
    }
    return out.sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

/**
 * Openverse — Wikimedia, Flickr, muzeylar va boshqa ochiq rasm bankalarini
 * bitta API ostida beradi (kalit talab qilmaydi, CORS ochiq). Wikimedia'da
 * topilmagan mavzular ko'pincha shu yerdan chiqadi.
 *
 * `thumbnail` endpointi hozir ishonchsiz (424 qaytaradi) — shuning uchun
 * to'g'ridan-to'g'ri `url` olinadi.
 */
async function searchOpenverse(query: string): Promise<ImageCandidate[]> {
  const q = query.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!q) return [];
  const queryTokens = tokens(q);
  try {
    const url =
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}` +
      // `commercial` — NC litsenziyalarsiz: dars taqdimoti erkin tarqatilishi mumkin.
      '&page_size=12&license_type=commercial&mature=false';
    const res = await fetchWithRetry(url, 12000);
    if (!res?.ok) return [];
    const data = (await res.json()) as {
      results?: {
        id?: string;
        title?: string;
        url?: string;
        creator?: string;
        license?: string;
        source?: string;
        tags?: { name?: string }[];
      }[];
    };
    const out: ImageCandidate[] = [];
    for (const item of data.results || []) {
      const imgUrl = item.url;
      if (!imgUrl) continue;
      const haystack = `${item.title || ''} ${(item.tags || []).map((t) => t.name).join(' ')}`;
      if (IRRELEVANT_IMAGE_HINTS.test(haystack)) continue;
      const hayTokens = new Set(tokens(haystack));
      const score = queryTokens.filter((w) => hayTokens.has(w)).length;
      if (queryTokens.length && score === 0) continue;
      const license = (item.license || 'CC').toUpperCase();
      const source = item.source ? ` (${item.source})` : '';
      const credit = item.creator
        ? `${item.creator} · ${license}${source}`
        : `${license}${source}`;
      out.push({
        url: imgUrl,
        credit,
        key: (item.title || item.id || imgUrl).toLowerCase().trim(),
        score,
      });
    }
    return out.sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

/**
 * URL dan fayl nomi kaliti — bir xil rasm turli manbalarda turlicha nomlanadi.
 *
 * Wikimedia thumb: `.../thumb/a/ab/Foo.png/1200px-Foo.png`, Openverse esa
 * o'sha rasmni `.../a/ab/Foo.png` deb beradi. Nomni normallashtirmasak, ayni
 * bitta rasm ikki slaydga tushib qolardi.
 */
function fileKeyFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const base = decodeURIComponent(path.split('/').filter(Boolean).pop() || '');
    return base.replace(/^\d+px-/i, '').toLowerCase().trim();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Barcha ochiq manbalar bo'yicha nomzodlar: avval Wikimedia (tibbiy
 * diagrammalar sifati yuqori), keyin Openverse. Bir rasm ikkala manbada
 * chiqsa, `key` bo'yicha bir marta qoladi.
 */
async function searchAllProviders(query: string): Promise<ImageCandidate[]> {
  const [wiki, openverse] = await Promise.all([
    searchOpenImages(query),
    searchOpenverse(query),
  ]);
  const seen = new Set<string>();
  return [...wiki, ...openverse].filter((c) => {
    if (seen.has(c.key)) return false;
    seen.add(c.key);
    return true;
  });
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetchWithRetry(url, 14000);
    if (!res?.ok) return null;
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

/**
 * Slaydga xos so'rovlar — umumiy "zaxira" so'rov YO'Q.
 *
 * Ilgari oxirgi zaxira sifatida qat'iy `human skin layers…` turardi: dermatologiya
 * bo'lmagan fanlarda mavzuga aloqasiz rasm, dermatologiyada esa o'nlab slaydga
 * AYNAN bir xil rasm tushardi. Endi so'rovlar faqat slaydning o'z `image_query`
 * si, sarlavhasi va fan nomidan quriladi.
 */
function queriesForSlide(slide: ContentSlide, subjectArea: string): string[] {
  const primary = (slide.image_query || '').trim();
  const title = (slide.title || '').trim();
  const subject = subjectArea.replace(/\s+/g, ' ').trim().slice(0, 40);
  // Sarlavhaning mazmunli so'zlari — `image_query` bo'sh yoki natija bermaganda.
  const titleKeywords = tokens(title).slice(0, 4).join(' ');
  return [
    primary,
    primary ? `${primary} diagram` : '',
    primary ? `${primary} anatomy illustration` : '',
    titleKeywords ? `${titleKeywords} ${subject}` : '',
    titleKeywords ? `${titleKeywords} medical illustration` : '',
    subject ? `${subject} medical illustration` : '',
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
const IMAGE_CONCURRENCY = 2;
/** Har so'rov orasidagi kichik pauza — Wikimedia cheklovini chetlab o'tish. */
const IMAGE_REQUEST_GAP_MS = 250;

export async function resolvePresentationImages(
  content: PresentationContent,
): Promise<PresentationContent> {
  // Butun taqdimot bo'yicha bitta rasm bir marta ishlatiladi.
  const usedKeys = new Set<string>();
  for (const slide of content.slides) {
    if (slide.imageUrl?.startsWith('data:') && slide.imageCredit) {
      usedKeys.add(slide.imageCredit.toLowerCase());
    }
  }

  const resolveOne = async (slide: ContentSlide): Promise<ContentSlide> => {
    if (slide.imageUrl?.startsWith('data:')) return slide;
    const tryFetch = IMAGE_TYPES.includes(slide.slide_type) || Boolean(slide.image_query);
    if (!tryFetch) return slide;

    for (const query of queriesForSlide(slide, content.subject_area)) {
      const candidates = await searchAllProviders(query);
      for (const cand of candidates) {
        // Band qilish SINXRON — parallel slaydlar bir rasmni olib qo'ymasin.
        const fileKey = fileKeyFromUrl(cand.url);
        if (usedKeys.has(cand.key) || usedKeys.has(fileKey)) continue;
        usedKeys.add(cand.key);
        usedKeys.add(fileKey);
        const dataUrl = await fetchImageAsDataUrl(cand.url);
        if (!dataUrl) {
          usedKeys.delete(cand.key);
          usedKeys.delete(fileKey);
          continue;
        }
        return { ...slide, imageUrl: dataUrl, imageCredit: cand.credit };
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
    if (i + IMAGE_CONCURRENCY < content.slides.length) await sleep(IMAGE_REQUEST_GAP_MS);
  }
  // Kafolat: bir xil rasm ikki slaydda qolib ketmasin (manbalar bir xil faylni
  // turli nom/o'lcham bilan berishi mumkin — yuqoridagi kalitlar o'tkazib
  // yuborsa, bu yerda mazmuni bo'yicha ushlanadi).
  const seenData = new Set<string>();
  const unique = slides.map((slide) => {
    if (!slide.imageUrl) return slide;
    if (seenData.has(slide.imageUrl)) {
      return { ...slide, imageUrl: undefined, imageCredit: undefined };
    }
    seenData.add(slide.imageUrl);
    return slide;
  });
  return demoteSlidesWithoutImages({ ...content, slides: unique });
}
