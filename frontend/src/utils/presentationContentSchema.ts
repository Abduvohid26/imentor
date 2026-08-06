/** Content Layer — LLM structured output (dizayndan mustaqil). */

export const SLIDE_TYPES = [
  'title',
  'agenda',
  'content_bullets',
  'two_column',
  'image_focus',
  'comparison_table',
  'statistics',
  'process_flow',
  'quote',
  'case_study',
  'summary',
  'references',
] as const;

export type SlideType = (typeof SLIDE_TYPES)[number];

export type SlideBody = {
  bullets?: string[];
  key_stat?: { number: string; label: string };
  columns?: { heading: string; points: string[] }[];
  comparison_rows?: { criteria: string; left: string; right: string }[];
  process_steps?: { step_number: number; label: string; description: string }[];
  quote_text?: string;
  quote_author?: string;
  /** statistics slaydida bir nechta kartochka */
  stats?: { number: string; label: string }[];
};

export type ContentSlide = {
  slide_type: SlideType;
  title: string;
  subtitle?: string;
  body: SlideBody;
  image_query?: string;
  speaker_notes?: string;
  /** Design Layer to‘ldiradi — Wikimedia data URL */
  imageUrl?: string;
  imageCredit?: string;
};

export type PresentationContent = {
  presentation_title: string;
  subject_area: string;
  author: string;
  slides: ContentSlide[];
};

/** Eski saqlangan deck: { title, slides: [{ title, bullets, notes }] } */
export type LegacyPresentationDeck = {
  title?: string;
  slides?: { title?: string; bullets?: string[]; notes?: string; imageUrl?: string; imageCredit?: string }[];
};

export const MAX_BULLETS = 5;
/** Qisqa atama emas — har bullet tushuntirish bilan (15–36 so‘z). */
export const MIN_WORDS_PER_BULLET = 15;
export const MAX_WORDS_PER_BULLET = 36;
export const MIN_SLIDES = 8;
export const MAX_SLIDES = 12;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function clipWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return words.slice(0, maxWords).join(' ');
}

function asSlideType(raw: unknown): SlideType {
  const s = String(raw || '').trim().toLowerCase();
  return (SLIDE_TYPES as readonly string[]).includes(s) ? (s as SlideType) : 'content_bullets';
}

function normalizeBullets(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b) => clipWords(String(b || '').trim(), MAX_WORDS_PER_BULLET))
    .filter((b) => b.length >= 3)
    .slice(0, MAX_BULLETS);
}

function defaultImageQuery(title: string, subject: string): string {
  const t = title.replace(/\s+/g, ' ').trim().slice(0, 60);
  const s = subject.replace(/\s+/g, ' ').trim().slice(0, 40);
  return `${s} ${t} medical anatomy diagram`.replace(/\s+/g, ' ').trim().slice(0, 120);
}

const IMAGE_SLIDE_TYPES: SlideType[] = [
  'content_bullets',
  'image_focus',
  'two_column',
  'case_study',
];

function normalizeBody(raw: unknown, slideType: SlideType): SlideBody {
  const b = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const body: SlideBody = {};

  body.bullets = normalizeBullets(b.bullets);

  if (b.key_stat && typeof b.key_stat === 'object') {
    const ks = b.key_stat as Record<string, unknown>;
    body.key_stat = {
      number: String(ks.number || '').trim().slice(0, 24),
      label: clipWords(String(ks.label || ''), 10),
    };
  }

  if (Array.isArray(b.stats)) {
    body.stats = b.stats
      .slice(0, 4)
      .map((row) => {
        const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
        return {
          number: String(r.number || '').trim().slice(0, 24),
          label: clipWords(String(r.label || ''), 10),
        };
      })
      .filter((x) => x.number || x.label);
  } else if (body.key_stat && (slideType === 'statistics' || !body.stats?.length)) {
    body.stats = [body.key_stat];
  }

  if (Array.isArray(b.columns)) {
    body.columns = b.columns.slice(0, 3).map((col) => {
      const c = col && typeof col === 'object' ? (col as Record<string, unknown>) : {};
      return {
        heading: clipWords(String(c.heading || ''), 8),
        points: normalizeBullets(c.points),
      };
    });
  }

  if (Array.isArray(b.comparison_rows)) {
    body.comparison_rows = b.comparison_rows.slice(0, 6).map((row) => {
      const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
      return {
        criteria: clipWords(String(r.criteria || ''), 8),
        left: clipWords(String(r.left || ''), 10),
        right: clipWords(String(r.right || ''), 10),
      };
    });
  }

  if (Array.isArray(b.process_steps)) {
    body.process_steps = b.process_steps.slice(0, 5).map((step, i) => {
      const s = step && typeof step === 'object' ? (step as Record<string, unknown>) : {};
      return {
        step_number: Number(s.step_number) || i + 1,
        label: clipWords(String(s.label || ''), 6),
        description: clipWords(String(s.description || ''), 24),
      };
    });
  }

  if (typeof b.quote_text === 'string') body.quote_text = String(b.quote_text).trim().slice(0, 280);
  if (typeof b.quote_author === 'string') body.quote_author = clipWords(String(b.quote_author), 8);

  return body;
}

function diversifyTypes(slides: ContentSlide[]): ContentSlide[] {
  if (slides.length < 2) return slides;
  const out = [...slides];
  for (let i = 1; i < out.length; i++) {
    if (out[i].slide_type !== out[i - 1].slide_type) continue;
    const alt = SLIDE_TYPES.find(
      (t) => t !== out[i].slide_type && t !== out[i - 1].slide_type && t !== 'title',
    );
    if (alt) out[i] = { ...out[i], slide_type: alt };
  }
  return out;
}

function fallbackSlides(title: string, subject: string): ContentSlide[] {
  return [
    {
      slide_type: 'title',
      title,
      subtitle: subject,
      body: { bullets: [] },
      image_query: 'medical education lecture hall',
    },
    {
      slide_type: 'agenda',
      title: 'Dars rejasi',
      body: {
        bullets: [
          'Asosiy tushunchalar',
          'Klinik belgilari',
          'Diagnostika',
          'Davolash tamoyillari',
          'Xulosa',
        ],
      },
    },
    {
      slide_type: 'content_bullets',
      title: 'Asosiy tushunchalar',
      body: {
        bullets: [
          'Markaziy taʼriflar: asosiy atamalar klinik kontekstda ochiladi va talaba uchun amaliy mezon beriladi.',
          'Tasniflash: asosiy turlari farqlovchi belgilari bilan ajratiladi va davolash yoʻnalishiga bogʻlanadi.',
          'Normal va patologik holat farqi: qaysi belgilar ogohlantiruvchi ekanligi aniq koʻrsatiladi.',
          'Amaliy xulosa: shikoyatdan birinchi diagnostik qadamgacha qisqa klinik zanjir beriladi.',
        ],
      },
      image_query: 'medical anatomy diagram',
    },
    {
      slide_type: 'statistics',
      title: 'Klinik ahamiyat',
      body: {
        stats: [
          { number: '1/3', label: 'Uchrash chastotasi' },
          { number: '72h', label: 'Erkta tashxis oynasi' },
          { number: '90%', label: 'Toʻgʻri davoda natija' },
        ],
      },
    },
    {
      slide_type: 'process_flow',
      title: 'Diagnostika ketma-ketligi',
      body: {
        process_steps: [
          { step_number: 1, label: 'Anamnez', description: 'Shikoyat va xavf omillari' },
          { step_number: 2, label: 'Koʻrik', description: 'Obyektiv belgilar' },
          { step_number: 3, label: 'Tekshiruv', description: 'Laboratoriya yoki instrumental' },
          { step_number: 4, label: 'Qaror', description: 'Tashxis va reja' },
        ],
      },
    },
    {
      slide_type: 'comparison_table',
      title: 'Differensial jihatlar',
      body: {
        comparison_rows: [
          { criteria: 'Boshlanishi', left: 'Oʻtkir', right: 'Surunkali' },
          { criteria: 'Belgilar', left: 'Yorqin', right: 'Sekin' },
          { criteria: 'Yondashuv', left: 'Shoshilinch', right: 'Kuzatuv' },
        ],
      },
    },
    {
      slide_type: 'case_study',
      title: 'Klinik holat',
      body: {
        bullets: [
          'Yosh bemor asosiy shikoyat bilan keladi va muhim anamnez elementi klinik yoʻnalishni belgilaydi.',
          'Birinchi differensial gipoteza shikoyat va obyektiv topilmalar asosida shakllanadi.',
          'Keyingi diagnostik qadam: eng xavfsiz va informativ tekshiruvdan boshlanadi.',
          'Qaror: tashxis ehtimoli va bemor xavfsizligi boʻyicha birinchi chora tanlanadi.',
        ],
      },
      image_query: 'clinical dermatology patient examination',
    },
    {
      slide_type: 'summary',
      title: 'Xulosa',
      body: {
        bullets: [
          'Taʼrif: asosiy tushunchalar aniq mezonlar bilan esda qolishi kerak.',
          'Erkta belgilar: ogohlantiruvchi simptomlarni oʻz vaqtida tanib olish muhim.',
          'Diagnostika: ketma-ketlik arzon va xavfsiz usullardan murakkabgacha boradi.',
          'Davolash: individual yondashuv monitoring va profilaktika bilan birga olib boriladi.',
        ],
      },
    },
  ];
}

/** OpenAI response_format.json_schema uchun */
export const PRESENTATION_JSON_SCHEMA = {
  name: 'imentor_presentation_content',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      presentation_title: { type: 'string' },
      subject_area: { type: 'string' },
      author: { type: 'string' },
      slides: {
        type: 'array',
        minItems: 8,
        maxItems: 12,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            slide_type: { type: 'string', enum: [...SLIDE_TYPES] },
            title: { type: 'string' },
            subtitle: { type: 'string' },
            body: {
              type: 'object',
              additionalProperties: false,
              properties: {
                bullets: { type: 'array', items: { type: 'string' } },
                key_stat: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    number: { type: 'string' },
                    label: { type: 'string' },
                  },
                  required: ['number', 'label'],
                },
                stats: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      number: { type: 'string' },
                      label: { type: 'string' },
                    },
                    required: ['number', 'label'],
                  },
                },
                columns: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      heading: { type: 'string' },
                      points: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['heading', 'points'],
                  },
                },
                comparison_rows: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      criteria: { type: 'string' },
                      left: { type: 'string' },
                      right: { type: 'string' },
                    },
                    required: ['criteria', 'left', 'right'],
                  },
                },
                process_steps: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      step_number: { type: 'number' },
                      label: { type: 'string' },
                      description: { type: 'string' },
                    },
                    required: ['step_number', 'label', 'description'],
                  },
                },
                quote_text: { type: 'string' },
                quote_author: { type: 'string' },
              },
              required: [
                'bullets',
                'key_stat',
                'stats',
                'columns',
                'comparison_rows',
                'process_steps',
                'quote_text',
                'quote_author',
              ],
            },
            image_query: { type: 'string' },
            speaker_notes: { type: 'string' },
          },
          required: ['slide_type', 'title', 'subtitle', 'body', 'image_query', 'speaker_notes'],
        },
      },
    },
    required: ['presentation_title', 'subject_area', 'author', 'slides'],
  },
} as const;

export function normalizePresentationContent(
  raw: Partial<PresentationContent> | null | undefined,
  defaults: { title: string; subject: string; author?: string },
): PresentationContent {
  const presentation_title = String(raw?.presentation_title || defaults.title || 'Taqdimot')
    .trim()
    .slice(0, 120);
  const subject_area = String(raw?.subject_area || defaults.subject || '')
    .trim()
    .slice(0, 80);
  const author = String(raw?.author || defaults.author || 'iMentor')
    .trim()
    .slice(0, 80);

  const mapped: ContentSlide[] = [];
  for (const [i, s] of (Array.isArray(raw?.slides) ? raw!.slides! : []).entries()) {
    const slide_type = asSlideType(s?.slide_type);
    const title = String(s?.title || `Slayd ${i + 1}`)
      .trim()
      .slice(0, 90);
    if (!title) continue;
    const body = normalizeBody(s?.body, slide_type);
    if (
      !body.bullets?.length &&
      !body.stats?.length &&
      !body.columns?.length &&
      !body.comparison_rows?.length &&
      !body.process_steps?.length &&
      !body.quote_text
    ) {
      body.bullets = [clipWords(title, MAX_WORDS_PER_BULLET)];
    }
    const image_query = s?.image_query
      ? String(s.image_query).trim().slice(0, 120)
      : IMAGE_SLIDE_TYPES.includes(slide_type)
        ? defaultImageQuery(title, subject_area)
        : undefined;
    mapped.push({
      slide_type,
      title,
      subtitle: s?.subtitle ? String(s.subtitle).trim().slice(0, 120) : undefined,
      body,
      image_query,
      speaker_notes: s?.speaker_notes ? String(s.speaker_notes).trim().slice(0, 800) : undefined,
      imageUrl: typeof s?.imageUrl === 'string' ? s.imageUrl : undefined,
      imageCredit: typeof s?.imageCredit === 'string' ? s.imageCredit : undefined,
    });
  }
  let slides = mapped;

  if (slides.length < MIN_SLIDES) {
    const fb = fallbackSlides(presentation_title, subject_area);
    for (const filler of fb) {
      if (slides.length >= MIN_SLIDES) break;
      if (slides.some((s) => s.title.toLowerCase() === filler.title.toLowerCase())) continue;
      slides.push(filler);
    }
  }

  // Birinchi slayd title bo'lsin
  if (slides[0] && slides[0].slide_type !== 'title') {
    slides = [
      {
        slide_type: 'title',
        title: presentation_title,
        subtitle: subject_area,
        body: { bullets: [] },
        image_query: slides[0].image_query || 'medical education',
      },
      ...slides,
    ];
  } else if (slides[0]) {
    slides[0] = { ...slides[0], slide_type: 'title' };
  }

  slides = diversifyTypes(slides).slice(0, MAX_SLIDES);

  return { presentation_title, subject_area, author, slides };
}

/** Eski deck → yangi content (tarix mosligi). */
export function coercePresentationContent(
  raw: unknown,
  defaults: { title: string; subject: string; author?: string },
): PresentationContent {
  if (!raw || typeof raw !== 'object') {
    return normalizePresentationContent(null, defaults);
  }
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.slides) && typeof obj.presentation_title === 'string') {
    return normalizePresentationContent(obj as Partial<PresentationContent>, defaults);
  }
  // legacy
  const legacy = obj as LegacyPresentationDeck;
  const slides: ContentSlide[] = (legacy.slides || []).map((s, i) => ({
    slide_type: i === 0 ? 'title' : i === 1 ? 'agenda' : 'content_bullets',
    title: String(s.title || `Slayd ${i + 1}`),
    body: { bullets: normalizeBullets(s.bullets) },
    speaker_notes: s.notes,
    imageUrl: s.imageUrl,
    imageCredit: s.imageCredit,
  }));
  return normalizePresentationContent(
    {
      presentation_title: legacy.title || defaults.title,
      subject_area: defaults.subject,
      author: defaults.author || 'iMentor',
      slides,
    },
    defaults,
  );
}

/** Preview / preparedContent uchun qisqa bullet roʻyxati */
export function slidePreviewBullets(slide: ContentSlide): string[] {
  const b = slide.body;
  if (b.bullets?.length) return b.bullets;
  if (b.stats?.length) return b.stats.map((s) => `${s.number} — ${s.label}`);
  if (b.process_steps?.length) return b.process_steps.map((s) => `${s.step_number}. ${s.label}`);
  if (b.columns?.length) return b.columns.map((c) => c.heading);
  if (b.comparison_rows?.length) return b.comparison_rows.map((r) => r.criteria);
  if (b.quote_text) return [clipWords(b.quote_text, 12)];
  return [];
}
