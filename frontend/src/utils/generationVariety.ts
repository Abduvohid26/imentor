type CaseLike = { questions: Array<{ scenario?: string }> };
type TestLike = { questions: Array<{ question?: string }> };

export type CaseStudyFocus = 'profilaktika' | 'davolash' | 'tashxis';

export const CASE_STUDY_FOCUS_ORDER: readonly CaseStudyFocus[] = ['profilaktika', 'davolash', 'tashxis'] as const;

function pickRandom<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

export function generationNonce(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildCaseStructurePrompt(topic: string): string {
  return [
    `Variatsiya ID: ${generationNonce()}.`,
    `Mavzu: "${topic}".`,
    'Aniq 3 ta keys — har biri BOSHQA klinik yo\'nalishda, lekin shu mavzuga oid:',
    '1-keys focus="profilaktika": profilaktika, skrining, xavf omillarini boshqarish, kasallikni oldini olish.',
    '2-keys focus="davolash": davolash strategiyasi, dori-darmon tanlash, kuzatuv, asoratlarni kamaytirish.',
    '3-keys focus="tashxis": differensial tashxis, qo\'shimcha tekshiruvlar, klinik mantiq, tashxisni asoslash.',
    'Uchala keys bir xil turdagi vaziyatni takrorlamasin — faqat mavzu bir xil bo\'lsin.',
    'Standart darslik misollarini va mashhur klassik keyslarni takrorlamang.',
  ].join(' ');
}

const TEST_ANGLES = [
  'diagnostika va differensial tashxis',
  'davolash strategiyasi tanlash',
  'laboratoriya va vizualizatsiya talqin qilish',
  'dori-darmonlar va kontrendikatsiyalar',
  'klinik yo\'riqnoma va protokol qo\'llash',
  'favqulodda yordam va triyaj',
  'prognostik omillar va asoratlar',
  'profilaktika va skrining',
  'patiens xavfsizligi va xatolarni oldini olish',
  'etika va bemor huquqlari',
];

export function buildTestVarietyPrompt(topic: string, count: number): string {
  const angles = pickRandom(TEST_ANGLES, 4);
  return [
    `Variatsiya ID: ${generationNonce()}.`,
    `Mavzu: "${topic}". ${count} ta NOYOB test savoli.`,
    'Avvalgi generatsiyalardagi savollarni qayta ishlatmang — yangi klinik ssenariyalar yozing.',
    `Asosiy yo'nalishlar: ${angles.join('; ')}.`,
    'To\'g\'ri javoblar A–E variantlari bo\'ylab teng taqsimlansin (faqat bir xil harfda emas).',
    'Har safar boshqacha bemorga, yoshga, shikoyatga va laboratoriya topilmalariga ega bo\'lsin.',
  ].join(' ');
}

export function summarizeCaseForAvoid(session: CaseLike): string {
  return session.questions
    .map((q, i) => `${i + 1}) ${(q.scenario || '').replace(/\s+/g, ' ').trim().slice(0, 140)}`)
    .join(' | ');
}

export function summarizeTestForAvoid(session: TestLike): string {
  return session.questions
    .map((q, i) => `${i + 1}) ${(q.question || '').replace(/\s+/g, ' ').trim().slice(0, 120)}`)
    .join(' | ');
}

export function buildAvoidRepeatsBlock(summaries: string[]): string {
  const limited = summaries.filter(Boolean).slice(0, 6);
  if (!limited.length) return '';
  return [
    '',
    'OLDIN YARATILGAN (QAYTA ISHLATMANG — yangi klinik holatlar/savollar yozing):',
    ...limited.map((s, i) => `- Oldingi ${i + 1}: ${s}`),
  ].join('\n');
}

export function parseKeywordsInput(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function buildCaseKeywordsFocusPrompt(keywords: string[]): string {
  if (!keywords.length) return '';
  return [
    '',
    `ASOSIY FOKUS KALIT SO'ZLAR (har bir keys kamida bitta kalit so'zni chuqur qamrab olsin): ${keywords.join(', ')}.`,
    'Keys ssenariy va javoblarda shu kalit so\'zlarga ustuvor e\'tibor bering.',
  ].join('\n');
}

export const GENERATION_UNIQUENESS_RULE =
  'Har generatsiya noyob bo\'lsin: bir xil ssenariy, savol matni yoki klassik darslik misolini takrorlamang.';
