import { type AppLanguage, inferPdfLanguage } from '../i18n/language';
import { translate } from '../i18n/translations';
import type { PresentationDeck } from '../utils/buildPresentationPptx';
import {
  extractTopicsByRegex,
  guessSubjectFromDocumentText,
  isWeakSyllabusExtraction,
  normalizeSyllabusDocumentText,
  normalizeSyllabusTopics,
  scoreSyllabusTopics,
} from '../utils/syllabusTopicParse';
import {
  extractSyllabusDocumentText,
  stripSyllabusFileExtension,
} from '../utils/syllabusDocumentText';
import { parseAiJson } from '../utils/parseAiJson';
import {
  OPENAI_CHAT,
  OPENAI_FAST,
  assertOpenAiApiKey,
  type BookContext,
  openaiJson,
  openaiText,
} from './openaiClient';

const SYS_MEDICAL =
  'Siz FJSTI tibbiyot professori va klinik ta\'lim metodistisiz. Javoblar ilmiy, aniq, darsga tayyor.';

import {
  buildAvoidRepeatsBlock,
  buildCaseStructurePrompt,
  buildCaseKeywordsFocusPrompt,
  buildTestVarietyPrompt,
  CASE_STUDY_FOCUS_ORDER,
  GENERATION_UNIQUENESS_RULE,
  summarizeCaseForAvoid,
  summarizeTestForAvoid,
  type CaseStudyFocus,
} from '../utils/generationVariety';
import { listPreparedForTopic, loadPreparedById } from '../utils/preparedContentStore';
import { normalizeCaseFocus } from '../utils/caseFocusLabels';
import { type MedicalReference } from '../utils/medicalReferences';

// Hech qachon tashqi (DOI/PubMed/veb) havola yoki "Foydalanilgan adabiyotlar" ro'yxati so'ralmaydi —
// bular ko'pincha AI tomonidan o'ylab topiladi (haqiqiy maqolaga bog'lanmasligi mumkin). Kitob
// konteksti bo'lsa — manba matn ichida (Manba: kitob, sahifa-bet) ko'rinishida ko'rsatiladi;
// bo'lmasa — hech qanday manba/havola ko'rsatilmaydi, faqat mazmun.
const NO_EXTERNAL_REFS_JSON_RULE_BOOK =
  'MAJBURIY: bu fan uchun rasmiy darslik (kitob) manba sifatida berilgan. Tashqi adabiyot/DOI/PubMed ' +
  'havolalari QO\'SHMANG — "references" maydonini bo\'sh massiv [] qoldiring. Har bir savol/slayd/bo\'lim ' +
  'matnida "(Manba: kitob nomi, sahifa-bet)" ko\'rsating.';
const NO_EXTERNAL_REFS_JSON_RULE_NOBOOK =
  'MAJBURIY: tashqi adabiyot/DOI/PubMed/veb havolalari yoki o\'ylab topilgan manbalar QO\'SHMANG — ' +
  '"references" maydonini bo\'sh massiv [] qoldiring. Hech qanday manba ko\'rsatmasdan, faqat ' +
  'mazmunning o\'ziga tayanib yozing.';
const NO_EXTERNAL_REFS_TEXT_RULE_BOOK =
  'MAJBURIY: bu fan uchun rasmiy darslik (kitob) manba sifatida berilgan. Tashqi (DOI/PubMed/veb) ' +
  'havolalar QO\'SHMANG. Har bir asosiy bo\'limda kamida 1 marta "(Manba: kitob nomi, sahifa-bet)" ' +
  'ko\'rsating. Oxirida qisqa "## Manbalar" bo\'limida FAQAT berilgan darsliklardan foydalanilgan ' +
  'kitoblar ro\'yxatini yozing (tashqi adabiyot qo\'shmang).';
const NO_EXTERNAL_REFS_TEXT_RULE_NOBOOK =
  'MAJBURIY: oxirida "## Foydalanilgan adabiyotlar" / "## Manbalar" bo\'limini YOZMANG, tashqi ' +
  '(DOI/PubMed/veb) havolalar yoki o\'ylab topilgan manbalar qo\'shmang — hech qanday link/manba ' +
  'ko\'rsatmasdan, faqat mazmunning o\'ziga tayanib yozing.';

function jsonReferencesRule(hasBookContext: boolean): string {
  return hasBookContext ? NO_EXTERNAL_REFS_JSON_RULE_BOOK : NO_EXTERNAL_REFS_JSON_RULE_NOBOOK;
}

function textReferencesRule(hasBookContext: boolean): string {
  return hasBookContext ? NO_EXTERNAL_REFS_TEXT_RULE_BOOK : NO_EXTERNAL_REFS_TEXT_RULE_NOBOOK;
}

function previousCaseAvoidBlock(topic: string): string {
  const summaries = listPreparedForTopic('case', topic)
    .slice(0, 6)
    .map((v) => loadPreparedById<CaseStudySession>('case', v.id))
    .filter((s): s is CaseStudySession => Boolean(s?.questions?.length))
    .map(summarizeCaseForAvoid);
  return buildAvoidRepeatsBlock(summaries);
}

function previousTestAvoidBlock(topic: string): string {
  const summaries = listPreparedForTopic('test', topic)
    .slice(0, 6)
    .map((v) => loadPreparedById<TestSession>('test', v.id))
    .filter((s): s is TestSession => Boolean(s?.questions?.length))
    .map(summarizeTestForAvoid);
  return buildAvoidRepeatsBlock(summaries);
}

export type { MedicalReference };

export interface CaseStudyQuestion {
  scenario: string;
  answer: string;
  focus?: 'profilaktika' | 'davolash' | 'tashxis';
  options?: string[];
  correctOptionIndex?: number;
  explanation?: string;
  references?: MedicalReference[];
}

export interface CaseStudySession {
  topic: string;
  questions: CaseStudyQuestion[];
  references?: MedicalReference[];
  keywords?: string[];
}

export interface TestQuestion {
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
  /** Har bir variant uchun alohida izoh: nega to'g'ri yoki nega xato (options bilan bir xil uzunlik) */
  optionExplanations?: string[];
  references?: MedicalReference[];
}

/** Bitta tildagi test tarkibi — asosiy TestSession bilan bir xil shakl, faqat translations'siz */
export interface TestSessionContent {
  topic: string;
  questions: TestQuestion[];
  references?: MedicalReference[];
}

export interface TestSession {
  id?: string;
  topic: string;
  questions: TestQuestion[];
  references?: MedicalReference[];
  createdAt?: number;
  authorUid?: string;
  /** Qolgan 2 tildagi tarjimalar — asosiy til `topic`/`questions`da, boshqalari shu yerda (uz/ru/en to'liq to'plami) */
  translations?: Partial<Record<AppLanguage, TestSessionContent>>;
}

export interface LectureNote {
  id?: string;
  topic: string;
  content: string;
  createdAt?: number;
  authorUid?: string;
}

export interface Exercise {
  title: string;
  description: string;
  tasks: {
    task: string;
    type: 'multiple_choice' | 'true_false' | 'short_answer';
    options?: string[];
    answer: string;
  }[];
}

function parseJSONSafe<T>(text: string | undefined): T {
  return parseAiJson<T>(text);
}

export interface SyllabusTopic {
  id: string; // M1/L1/Л1 or A1/P1/П1
  title: string;
  type: 'lecture' | 'practical';
  /** Fan katalogi identifikatori (mavzu konteksti) */
  syllabusId?: number;
  subjectName?: string;
  variantLabel?: string;
}

export interface SyllabusExtractResult {
  subject_name: string;
  topics: SyllabusTopic[];
  instruction_language: AppLanguage;
}

function languageName(lang: AppLanguage): string {
  if (lang === 'ru') return 'Russian';
  if (lang === 'en') return 'English';
  return 'Uzbek';
}

const SYLLABUS_AI_JSON_HINT =
  '{"subject_name":"...","instruction_language":"uz|en|ru","topics":[{"id":"L1","title":"...","type":"lecture|practical"}]}';

const SYLLABUS_NO_TRANSLATE_RULE =
  'CRITICAL: subject_name and every topic title MUST stay in the original document language. NEVER translate.';

const SYLLABUS_AI_SYSTEM =
  'You are an academic syllabus parser for university medical courses. Return JSON only. ' +
  `Schema: ${SYLLABUS_AI_JSON_HINT}. ` +
  'Rules: subject_name = ONE course/discipline (fan), NOT university or faculty name. ' +
  'Each topic = one numbered syllabus line (mavzu) in document order. ' +
  'Topic ids: L or M + number for lectures (ma\'ruza/лекция), A or P + number for practicals (amaliy/практика). ' +
  'Include ALL topics; do not skip or merge. If only lectures OR only practicals exist, do NOT invent the other type. ' +
  SYLLABUS_NO_TRANSLATE_RULE;

function pickBetterExtract(a: SyllabusExtractResult, b: SyllabusExtractResult): SyllabusExtractResult {
  const scoreA = scoreSyllabusTopics(a.topics);
  const scoreB = scoreSyllabusTopics(b.topics);
  if (scoreB > scoreA) return b;
  if (scoreA > scoreB) return a;
  if (b.subject_name.length > a.subject_name.length) return b;
  return a;
}

async function extractSyllabusWithAi(
  file: File,
  docText: string,
): Promise<SyllabusExtractResult> {
  const normalizedText = normalizeSyllabusDocumentText(docText);
  const docLang = inferPdfLanguage(normalizedText);
  const docLangName = languageName(docLang);
  let best: SyllabusExtractResult = { subject_name: '', topics: [], instruction_language: docLang };

  try {
    const textRaw = await openaiJson({
      model: OPENAI_CHAT,
      system: SYLLABUS_AI_SYSTEM,
      user:
        `Document language: ${docLangName}. File: "${file.name}". ${SYLLABUS_NO_TRANSLATE_RULE}\n\n` +
        normalizedText.slice(0, 100000),
      maxTokens: 6144,
      parse: (t) => parseJSONSafe<Partial<SyllabusExtractResult>>(t),
    });
    best = normalizeSyllabusExtract(textRaw, file.name, normalizedText);
  } catch (firstAiError) {
    console.warn('Syllabus AI text pass failed:', firstAiError);
  }

  if (isWeakSyllabusExtraction(best.topics)) {
    try {
      const retryRaw = await openaiJson({
        model: OPENAI_FAST,
        system:
          SYLLABUS_AI_SYSTEM +
          ' List every numbered topic line from the syllabus table of contents or topic list.',
        user:
          `Document language: ${docLangName}. Extract ALL topics with correct lecture/practical type.\n\n` +
          normalizedText.slice(0, 100000),
        maxTokens: 6144,
        parse: (t) => parseJSONSafe<Partial<SyllabusExtractResult>>(t),
      });
      best = pickBetterExtract(best, normalizeSyllabusExtract(retryRaw, file.name, normalizedText));
    } catch (retryError) {
      console.warn('Syllabus AI retry failed:', retryError);
    }
  }

  const regexPass = extractTopicsByRegex(normalizedText);
  if (regexPass.length > 0) {
    const regexResult = normalizeSyllabusExtract({ topics: regexPass }, file.name, normalizedText);
    best = pickBetterExtract(best, regexResult);
  }

  if (best.topics.length > 0) {
    return best;
  }

  throw new Error('syllabus-extract-failed');
}

function inferSyllabusInstructionLanguage(
  result: Pick<SyllabusExtractResult, 'subject_name' | 'topics'>,
  pdfText: string,
  explicit?: string,
): AppLanguage {
  const raw = (explicit || '').trim().toLowerCase();
  if (raw === 'uz' || raw === 'en' || raw === 'ru') return raw;
  const blob = [pdfText, result.subject_name, ...result.topics.map((t) => t.title)].filter(Boolean).join('\n');
  return inferPdfLanguage(blob);
}

function finalizeSyllabusExtract(
  result: Omit<SyllabusExtractResult, 'instruction_language'>,
  pdfText: string,
  explicitLang?: string,
): SyllabusExtractResult {
  return {
    ...result,
    instruction_language: inferSyllabusInstructionLanguage(result, pdfText, explicitLang),
  };
}

function normalizeSyllabusExtract(
  data: Partial<SyllabusExtractResult> | SyllabusTopic[] | null | undefined,
  fileName: string,
  pdfText = '',
): SyllabusExtractResult {
  let subject_name = '';
  let rawTopics: SyllabusTopic[] = [];

  if (Array.isArray(data)) {
    rawTopics = data;
  } else if (data && typeof data === 'object') {
    subject_name = String(data.subject_name || '').trim();
    rawTopics = Array.isArray(data.topics) ? data.topics : [];
  }

  const topics = normalizeSyllabusTopics(rawTopics);
  if (!subject_name) {
    subject_name = guessSubjectFromDocumentText(pdfText);
  }
  if (!subject_name) {
    subject_name = stripSyllabusFileExtension(fileName).replace(/\s*\([^)]*\)\s*$/, '').trim();
  }

  const base = {
    subject_name: subject_name.slice(0, 255) || 'Fan',
    topics,
  };
  const explicitLang =
    data && !Array.isArray(data) && typeof data === 'object' ? data.instruction_language : undefined;
  return finalizeSyllabusExtract(base, pdfText, explicitLang);
}

function syllabusExtractionErrorMessage(err: unknown, fileName: string, lang: AppLanguage = 'uz'): string {
  const msg = err instanceof Error ? err.message : String(err || '');
  if (msg === 'empty-document') {
    return translate(lang, 'ai.error.syllabusEmpty', { fileName });
  }
  if (msg === 'doc-empty') {
    return translate(lang, 'ai.error.syllabusDocEmpty', { fileName });
  }
  if (msg === 'unsupported-format') {
    return translate(lang, 'ai.error.syllabusUnsupported', { fileName });
  }
  if (msg.startsWith('empty:')) {
    return translate(lang, 'ai.error.syllabusNoTopics', { fileName });
  }
  if (/api|key|401|403/i.test(msg)) {
    return translate(lang, 'ai.error.openai');
  }
  return translate(lang, 'ai.error.syllabusParseFailed', { fileName });
}

export { syllabusExtractionErrorMessage };

function sanitizeImagePrompt(prompt: string, maxLen: number): string {
  const compact = prompt.replace(/\s+/g, ' ').trim();
  return compact.slice(0, maxLen);
}

async function fetchImageAsDataUrl(url: string, timeoutMs: number = 14000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    window.clearTimeout(timeoutId);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return null;
    const blob = await res.blob();
    if (!blob || blob.size < 8_000) return null;
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

function isWeakCaseSession(data: CaseStudySession | null | undefined): boolean {
  if (!data || !Array.isArray(data.questions) || data.questions.length < 3) return true;
  const lengths = data.questions.map((q) => ({
    s: (q.scenario || '').trim().length,
    a: (q.answer || '').trim().length,
  }));
  const tooShortCount = lengths.filter((x) => x.s < 100 || x.a < 80).length;
  return tooShortCount >= 2;
}

const CASE_FOCUS_HINTS: Record<CaseStudyFocus, string> = {
  profilaktika: 'profilaktika, skrining, xavf omillarini boshqarish, kasallikni oldini olish',
  davolash: 'davolash strategiyasi, dori tanlash, kuzatuv, asoratlarni kamaytirish',
  tashxis: 'differensial tashxis, qo\'shimcha tekshiruvlar, klinik mantiq, tashxisni asoslash',
};

async function generateSingleCaseQuestion(
  topic: string,
  focus: CaseStudyFocus,
  language: AppLanguage,
  keywordFocus: string,
  avoid: string,
  subjectCode?: string,
): Promise<CaseStudyQuestion> {
  const outLang = languageName(language);
  const structure = buildCaseStructurePrompt(topic);
  const bookContext: BookContext | undefined = subjectCode ? { subjectCode, topicQuery: topic } : undefined;
  const hasBookContext = Boolean(bookContext);
  const request = (strict: boolean) =>
    openaiJson<{ scenario?: string; answer?: string; references?: MedicalReference[]; focus?: string }>({
      model: OPENAI_CHAT,
      system:
        `${SYS_MEDICAL} ${GENERATION_UNIQUENESS_RULE} Return ONLY valid JSON object: ` +
        `{"scenario":"...","answer":"...","references":[]}. ` +
        `If book excerpts (manba context) were given, cite them inside "answer" text as "(Manba: kitob nomi, sahifa-bet)" — never outside the JSON. ` +
        `Language: ${outLang}. focus="${focus}". ${jsonReferencesRule(hasBookContext)}`,
      user:
        `${structure}${keywordFocus}${avoid}\n\n` +
        `Generate ONE clinical case with focus="${focus}" (${CASE_FOCUS_HINTS[focus]}). ` +
        'Scenario: 2–4 paragraphs with patient details. Answer: 2–4 paragraphs, focus-specific clinical reasoning. ' +
        (hasBookContext
          ? 'Leave "references" as an empty array — cite the book inline in "answer" instead. '
          : 'Leave "references" as an empty array — do not fabricate or cite any sources. ') +
        (strict ? 'Strict valid JSON only.' : ''),
      maxTokens: 3072,
      temperature: strict ? 0.4 : 0.58,
      parse: (t) => parseJSONSafe(t),
      bookContext,
    });

  let raw: { scenario?: string; answer?: string; references?: MedicalReference[]; focus?: string };
  try {
    raw = await request(false);
  } catch {
    raw = await request(true);
  }

  return {
    scenario: (raw.scenario || '').trim(),
    answer: (raw.answer || '').trim(),
    focus: normalizeCaseFocus(raw.focus, CASE_STUDY_FOCUS_ORDER.indexOf(focus)),
  };
}

function normalizeCaseSession(topic: string, data: CaseStudySession): CaseStudySession {
  const rawQuestions = [...(data.questions || [])].slice(0, 3);
  while (rawQuestions.length < 3) {
    const focus = CASE_STUDY_FOCUS_ORDER[rawQuestions.length];
    rawQuestions.push({ scenario: '', answer: '', focus });
  }

  const cleanedQuestions = rawQuestions.map((q, i) => {
      const scenario = (q.scenario || '').trim();
      const answer = (q.answer || '').trim();
      const fallbackScenario = [
        `Klinik vaziyat ${i + 1}: ${topic} bo'yicha murakkab holat.`,
        "Bemorning asosiy shikoyatlari, anamnezi va xavf omillari batafsil tahlil qilinadi.",
        "Ko'rik topilmalari hamda laborator/instrumental natijalar asosida diagnostik qaror talab etiladi.",
      ].join(' ');
      const fallbackAnswer = [
        "Bosqichma-bosqich yondashuv: (1) birlamchi baholash va xavfni stratifikatsiya qilish;",
        "(2) differensial diagnostikani klinik dalillar bilan toraytirish;",
        "(3) asosiy tashxisni asoslash;",
        "(4) dalillarga asoslangan davolash rejasi va monitoring;",
        "(5) bemor xavfsizligi hamda keyingi kuzatuv rejasi.",
      ].join(' ');
      const focus = normalizeCaseFocus((q as CaseStudyQuestion).focus, i);
      return {
        scenario: scenario.length >= 120 ? scenario : fallbackScenario,
        answer: answer.length >= 120 ? answer : fallbackAnswer,
        focus,
      };
    });
  return {
    topic: (data.topic || topic || '').trim() || topic,
    questions: cleanedQuestions,
    references: [],
  };
}

function isWeakTestSession(data: TestSession | null | undefined, requestedCount: number): boolean {
  if (!data || !Array.isArray(data.questions)) return true;
  if (data.questions.length < Math.min(requestedCount, 6)) return true;
  const badQuestions = data.questions.filter((q) => {
    const qLen = (q.question || '').trim().length;
    const expLen = (q.explanation || '').trim().length;
    const opts = Array.isArray(q.options) ? q.options : [];
    const badOptions = opts.length !== 5 || opts.some((o) => (o || '').trim().length < 8);
    return qLen < 120 || expLen < 70 || badOptions;
  });
  return badQuestions.length > Math.max(1, Math.floor(data.questions.length * 0.35));
}

function normalizeTestSession(topic: string, data: TestSession, requestedCount: number): TestSession {
  const questions = (data.questions || [])
    .slice(0, requestedCount)
    .map((q) => {
      const options = (q.options || []).slice(0, 5);
      while (options.length < 5) options.push(`Variant ${options.length + 1}`);
      const correctOptionIndex =
        typeof q.correctOptionIndex === 'number' && q.correctOptionIndex >= 0 && q.correctOptionIndex < 5
          ? q.correctOptionIndex
          : 0;
      const optionExplanations = (q.optionExplanations || []).slice(0, 5).map((e) => (e || '').trim());
      while (optionExplanations.length < 5) optionExplanations.push('');
      const hasOptionExplanations = optionExplanations.some((e) => e.length > 0);
      return {
        question: (q.question || '').trim(),
        options: options.map((o) => (o || '').trim()),
        explanation: (q.explanation || '').trim(),
        correctOptionIndex,
        ...(hasOptionExplanations ? { optionExplanations } : {}),
      };
    });
  return {
    ...data,
    topic: (data.topic || topic || '').trim() || topic,
    questions,
    references: [],
  };
}

const ALL_TEST_LANGUAGES: AppLanguage[] = ['uz', 'ru', 'en'];

/** Tayyor testni boshqa tilga tarjima qiladi — faktlar/to'g'ri javob o'zgarmaydi, faqat matn. */
async function translateTestSession(
  content: TestSessionContent,
  targetLang: AppLanguage,
): Promise<TestSessionContent> {
  const outLang = languageName(targetLang);
  const source = {
    topic: content.topic,
    questions: content.questions.map((q) => ({
      question: q.question,
      options: q.options,
      correctOptionIndex: q.correctOptionIndex,
      explanation: q.explanation,
      optionExplanations: q.optionExplanations,
    })),
  };
  const translated = await openaiJson<{ topic?: string; questions?: TestQuestion[] }>({
    model: OPENAI_FAST,
    system:
      'You are a precise medical translator. Translate the given JSON test into ' +
      `${outLang}. Keep the EXACT same JSON structure, keys, array lengths and order. ` +
      'NEVER change correctOptionIndex or any number. Translate every text field ' +
      '(topic, question, options, explanation, optionExplanations) naturally, including any ' +
      'inline citation phrase like "(Manba: kitob, sahifa-bet)" — translate the label word too ' +
      `("Manba" → "Источник" for Russian, "Source" for English), keeping the book title and page number unchanged. ` +
      'Return ONLY valid JSON, no markdown fences.',
    user: JSON.stringify(source),
    maxTokens: 6144,
    temperature: 0.15,
    parse: (t) => parseJSONSafe(t),
  });

  const questions: TestQuestion[] = content.questions.map((original, i) => {
    const t = translated.questions?.[i];
    return {
      question: (t?.question || original.question).trim(),
      options: (t?.options?.length === original.options.length ? t.options : original.options).map((o) =>
        (o || '').trim(),
      ),
      correctOptionIndex: original.correctOptionIndex,
      explanation: (t?.explanation || original.explanation || '').trim(),
      ...(original.optionExplanations
        ? {
            optionExplanations: (
              t?.optionExplanations?.length === original.optionExplanations.length
                ? t.optionExplanations
                : original.optionExplanations
            ).map((e) => (e || '').trim()),
          }
        : {}),
      ...(original.references ? { references: original.references } : {}),
    };
  });

  return {
    topic: (translated.topic || content.topic).trim(),
    questions,
    references: content.references,
  };
}

/** Test'ni asosiy tilda generatsiya qilgandan keyin qolgan 2 tilga parallel tarjima qiladi. */
async function attachTestTranslations(session: TestSession, primaryLang: AppLanguage): Promise<TestSession> {
  const remaining = ALL_TEST_LANGUAGES.filter((l) => l !== primaryLang);
  const results = await Promise.allSettled(
    remaining.map((lang) => translateTestSession(session, lang)),
  );
  const translations: Partial<Record<AppLanguage, TestSessionContent>> = {};
  results.forEach((res, i) => {
    if (res.status === 'fulfilled') {
      translations[remaining[i]] = res.value;
    } else {
      console.warn(`Test translation to ${remaining[i]} failed:`, res.reason);
    }
  });
  return Object.keys(translations).length ? { ...session, translations } : session;
}

const PRESENTATION_MIN_SLIDES = 10;
const PRESENTATION_MIN_BULLETS = 6;
/** Qisqa "bir qator fakt" emas — har bullet kamida shuncha belgi */
const PRESENTATION_MIN_BULLET_CHARS = 55;

function fallbackPresentationSlides(fallbackTitle: string): PresentationDeck['slides'] {
  return [
    {
      title: 'Kirish',
      bullets: [
        `Mavzu: ${fallbackTitle} — dars maqsadi va ahamiyati`,
        'Asosiy tushunchalar va ta\'riflar — keyingi slaydda batafsil',
        'Etiologiya va xavf omillari — sabablar tizimi',
        'Patogenez / mexanizm — jarayon bosqichlari',
        'Klinik ko\'rinish va diagnostika — belgi va tekshiruvlar',
        'Davolash, profilaktika va xulosa — amaliy yo\'nalish',
      ],
      notes: 'Kirishda faqat reja. Har tema keyingi slaydlarda chuqur ochiladi.',
    },
    {
      title: 'Asosiy tushunchalar',
      bullets: [
        'Markaziy atamalar aniq ta\'rif bilan ochiladi: nima ekanligi, qayerda uchrashi va klinik amaliyotda nima uchun muhimligi tushuntiriladi.',
        'Tasniflash mezonlari bo\'yicha guruhlash: asosiy turlari, farqlovchi belgilari va har bir guruhning amaliy ahamiyati ko\'rsatiladi.',
        'Normal holat bilan patologik o\'zgarish farqi: qaysi belgilar ogohlantiruvchi ekanligi va qachon chuqurroq tekshiruv kerakligi aytiladi.',
        'Qisqa klinik misol orqali tushunchalar mustahkamlanadi: bemor shikoyati, kutiladigan topilma va birinchi qadam.',
        'Talaba eslab qolishi kerak bo\'lgan asosiy xulosa: ta\'rif + tasnif + klinik signal — uchlik sifatida takrorlanadi.',
        'Keyingi slaydga o\'tish: etiologiya sabab omillarini shu tushunchalar bilan bog\'lab ochish.',
      ],
      notes: 'Har bir ta\'rifni misol bilan bog\'lang; faqat atama sanab o\'tish yetarli emas.',
    },
    {
      title: 'Etiologiya',
      bullets: [
        'Asosiy sabab omillari guruhlarga bo\'linadi: ichki, tashqi va aralash omillar, har biriga qisqa klinik izoh beriladi.',
        'Xavf guruhlari aniq sanab o\'tiladi: yosh, jins, kasbiy ta\'sir, surunkali kasalliklar va genetik moyillik.',
        'Trigger mexanizmlar: qaysi sharoitda jarayon faollashishi, qanday belgi bilan namoyon bo\'lishi tushuntiriladi.',
        'Oldini olish imkoniyatlari: birlamchi profilaktika choralari va bemorga beriladigan amaliy tavsiyalar.',
        'Klinik ahamiyat: sababni bilish davolash strategiyasini qanday o\'zgartirishi misol bilan ochiladi.',
        'Xulosa: etiologiya — tasodifiy ro\'yxat emas, diagnostika va terapiyani yo\'naltiruvchi asos.',
      ],
      notes: 'Sabablarni jadval yoki sxema sifatida sanab, keyin klinik bog\'lanishni so\'rang.',
    },
    {
      title: 'Patogenez / mexanizm',
      bullets: [
        'Jarayon bosqichma-bosqich: boshlang\'ich omil → zanjir reaksiya → klinik namoyon bo\'lish ketma-ketligi ochiladi.',
        'Asosiy zanjirlar va o\'zaro bog\'liqlik: qaysi tizimlar ishtirok etadi va ular bir-birini qanday kuchaytiradi.',
        'Kompensatsiya mexanizmlari: organizm qanday moslashadi, qachon kompensatsiya yetarli bo\'lmaydi.',
        'Asoratlar yo\'li: kechikkan yoki noto\'g\'ri boshqarilgan holatda qanday og\'irlashishlar kutiladi.',
        'Amaliy xulosa: mexanizmni tushunish davolash nuqtalarini (qayerga ta\'sir qilish) aniqlaydi.',
        'Talaba uchun eslatma: mexanizmni 3 bosqichda qayta aytib berish mashqi.',
      ],
      notes: 'Doskada oddiy 3–4 bosqichli sxema chizing.',
    },
    {
      title: 'Klinik ko\'rinish',
      bullets: [
        'Asosiy simptomlar batafsil: bemor nima shikoyat qiladi, qancha vaqtdan beri, nima kuchaytiradi yoki yengillashtiradi.',
        'Obyektiv belgilar va topilmalar: ko\'rikda nima ko\'rinadi, qaysi belgi yuqori xavfni bildiradi.',
        'Og\'irlik darajalari: engil, o\'rtacha, og\'ir — har biri uchun farqlovchi mezonlar.',
        'Differensial jihatlar: o\'xshash holatlar bilan qanday ajratiladi, qaysi belgi chalkashtirmaslikka yordam beradi.',
        'Urgentsiya belgilari: qachon zudlik bilan yo\'naltirish yoki shoshilinch choralar kerak.',
        'Amaliy tip: qisqa "shikoyat → topilma → keyingi qadam" zanjiri.',
      ],
      notes: 'Real klinik hikoya bilan oching; faqat simptom ro\'yxati bilan cheklanmang.',
    },
    {
      title: 'Diagnostika',
      bullets: [
        'Anamnez va fizikal ko\'rik: qaysi savollar majburiy, qaysi topilmalar yo\'nalish beradi.',
        'Laborator tekshiruvlar: asosiy ko\'rsatkichlar, ularning talqini va yolg\'on musbat/manfiy ehtimoli.',
        'Instrumental usullar: qachon qaysi usul tanlanadi, nima kutish mumkin.',
        'Diagnostik mezonlar: tasdiqlash uchun minimal majburiy to\'plam.',
        'Xatoliklarga yo\'l qo\'ymaslik: kechikkan tashxis va ortiqcha tekshiruvlardan qochish tamoyillari.',
        'Xulosa: diagnostika ketma-ketligi — arzon/xavfsizdan murakkabgacha.',
      ],
      notes: 'Algoritm chizing: 1-qadam, 2-qadam, tasdiqlash.',
    },
    {
      title: 'Davolash tamoyillari',
      bullets: [
        'Konservativ yondashuv: qachon dori-darmonsiz yoki dastlabki choralar yetarli.',
        'Asosiy terapiya: preparat/usul tanlash mezonlari, dozaga oid umumiy tamoyillar (aniq dozani kitobdan tekshirish).',
        'Jarrohlik yoki invaziv variantlar: ko\'rsatma va qarshi ko\'rsatmalar qisqa ochiladi.',
        'Qo\'llab-quvvatlovchi choralar: og\'riq, infektsiya, ovqatlanish, reabilitatsiya.',
        'Monitoring: qaysi belgi/analiz dinamikasi kuzatiladi, qachon rejim o\'zgartiriladi.',
        'Xavfsizlik: asorat belgilarini bemorga tushuntirish muhimligi.',
      ],
      notes: 'Davolashni maqsad → usul → monitoring sxemasida bering.',
    },
    {
      title: 'Profilaktika va kuzatuv',
      bullets: [
        'Birlamchi profilaktika: xavf omillarini kamaytirish bo\'yicha aniq tavsiyalar.',
        'Ikkinchi darajali chora-tadbirlar: skrining, erta aniqlash, yuqori xavf guruhlarini kuzatish.',
        'Bemorni kuzatish rejasi: qayta tashrif muddatlari va nimalarni qayta baholash.',
        'Hayot tarzi uchun amaliy maslahatlar: ovqatlanish, faollik, zararli odatlar.',
        'Oilaviy/ijtimoiy qo\'llab-quvvat: rioya qilishni oshiradigan omillar.',
        'Xulosa: profilaktika davolashdan kam ahamiyatli emas.',
      ],
      notes: 'Talabalarga "bemorga 3 ta aniq tavsiya" mashqi bering.',
    },
    {
      title: 'Klinik misol / amaliy vazifa',
      bullets: [
        'Qisqa klinik holat: yosh, asosiy shikoyat, muhim anamnez elementi beriladi.',
        'Muhim savollar: talaba qanday qo\'shimcha ma\'lumot so\'rashi kerakligi.',
        'Kutiladigan topilmalar: ko\'rik va birinchi tekshiruvlarda nima chiqishi mumkin.',
        'Qaror qabul qilish: differensial → eng ehtimolli tashxis → birinchi chora.',
        'Xavfni baholash: qachon shoshilinch yo\'naltirish kerakligi.',
        'Muhokama: guruhda 2–3 daqiqalik javob va o\'qituvchi xulosasi.',
      ],
      notes: 'Holatni ovoz chiqarib o\'qing, keyin savollarni bosqichma-bosqich oching.',
    },
    {
      title: 'Xulosa',
      bullets: [
        'Asosiy xulosalar: tushuncha, sabab, mexanizm, klinik belgi — qisqa zanjir.',
        'Eslab qolish kerak: erta aniqlash va to\'g\'ri diagnostika ketma-ketligi.',
        'Amaliy ahamiyat: bemor xavfsizligi va davolashni individual tanlash.',
        'Keyingi mavzuga bog\'lanish: chuqurroq yo\'nalish yoki amaliy mashg\'ulot.',
        'Savol-javob: 2–3 ta tekshiruv savoli bilan darsni yakunlash.',
        'Manbalar: dars davomida ko\'rsatilgan darslik sahifalarini qayta ko\'rib chiqing.',
      ],
      notes: 'Xulosani doskada 5 nuqta qilib yozib qo\'ying.',
    },
  ];
}

function normalizePresentationDeck(
  raw: Partial<PresentationDeck> | null | undefined,
  fallbackTitle: string,
): PresentationDeck {
  const title = (raw?.title || fallbackTitle || 'Taqdimot').trim().slice(0, 120);
  const slides = (Array.isArray(raw?.slides) ? raw!.slides! : [])
    .map((s, i) => {
      const st = String(s?.title || `Slayd ${i + 1}`).trim();
      const bullets = (Array.isArray(s?.bullets) ? s.bullets : [])
        .map((b) => String(b || '').trim())
        .filter((b) => b.length >= 20)
        .slice(0, 8);
      let notes = String(s?.notes || '').trim();
      if (!st || bullets.length < 3) return null;
      // Notes ichidagi qo'shimcha jumlalarni slaydga ko'tarish (qisqa faktlarni boyitish)
      if (bullets.length < PRESENTATION_MIN_BULLETS && notes) {
        for (const part of notes.split(/(?<=[.!?])\s+/)) {
          const p = part.trim();
          if (p.length < 30) continue;
          if (/^\(?manba:/i.test(p)) continue;
          if (bullets.some((b) => b.includes(p.slice(0, 28)))) continue;
          bullets.push(p.slice(0, 220));
          if (bullets.length >= PRESENTATION_MIN_BULLETS) break;
        }
      }
      // Manba notes oxirida saqlansin
      const manba = notes.match(/\(Manba:\s*[^)]+\)/i)?.[0] || notes.match(/Manba:\s*[^\n.]+/i)?.[0];
      if (manba && !notes.includes(manba)) notes = `${notes} ${manba}`.trim();
      return {
        title: st.slice(0, 120),
        bullets: bullets.slice(0, 8),
        notes: notes || undefined,
      };
    })
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  if (slides.length >= PRESENTATION_MIN_SLIDES) {
    return { title, slides: slides.slice(0, 28) };
  }

  const padded: PresentationDeck['slides'] = [...slides];
  for (const filler of fallbackPresentationSlides(fallbackTitle)) {
    if (padded.length >= PRESENTATION_MIN_SLIDES) break;
    if (padded.some((s) => s.title.toLowerCase() === filler.title.toLowerCase())) continue;
    padded.push(filler);
  }
  while (padded.length < PRESENTATION_MIN_SLIDES) {
    padded.push({
      title: `Qo'shimcha slayd ${padded.length + 1}`,
      bullets: [
        `${fallbackTitle}: bu bo'limda mavzuning qo'shimcha klinik va nazariy jihatlari batafsil ochiladi.`,
        'Asosiy tushunchalar mustahkamlanadi: ta\'rif, tasnif va amaliy misol ketma-ketligi beriladi.',
        'Klinik / amaliy misol orqali talaba qaror qabul qilish bosqichlarini ko\'rib chiqadi.',
        'Muhim eslatma: xavf belgilari va qachon shoshilinch yo\'naltirish kerakligi ta\'kidlanadi.',
        'Keyingi qadam: xulosa va savol-javobga o\'tishdan oldin asosiy nuqtalar takrorlanadi.',
        'Manba bo\'lsa, tegishli darslik sahifasini qayta ko\'rib chiqing.',
      ],
      notes: 'Bu slaydni mavzu kontekstida batafsil oching.',
    });
  }
  return { title, slides: padded.slice(0, 28) };
}

async function requestPresentationDeckFromAi(params: {
  topicTitle: string;
  topicId: string;
  topicType: 'lecture' | 'practical';
  subjectName: string;
  variantLabel: string;
  language: AppLanguage;
  mode: 'generate' | 'enhance';
  sourceFileName?: string;
  sourceText?: string;
  subjectCode?: string;
}): Promise<PresentationDeck> {
  assertOpenAiApiKey();
  const outLang = languageName(params.language);
  const bookContext: BookContext | undefined = params.subjectCode
    ? { subjectCode: params.subjectCode, topicQuery: params.topicTitle }
    : undefined;
  const kind = params.topicType === 'practical' ? 'amaliy mashg\'ulot' : 'ma\'ruza';
  const fallbackTitle = `${params.topicId} — ${params.topicTitle}`;
  const enhanceBlock =
    params.mode === 'enhance'
      ? `O'qituvchi allaqachon taqdimot yuklagan ("${params.sourceFileName || 'fayl'}"). ` +
        `Mavjud material asosida dars uchun yanada boyitilgan, tuzilgan taqdimot yarating. ` +
        (params.sourceText?.trim()
          ? `Yuklangan fayldan ajratilgan matn:\n${params.sourceText.slice(0, 12000)}\n`
          : '')
      : 'O\'qituvchida taqdimot yo\'q — mavzu bo\'yicha noldan dars taqdimoti yarating.';

  const userPrompt =
    `Fan: ${params.subjectName}. Yo'nalish: ${params.variantLabel}. ` +
    `Mavzu ${params.topicId} (${kind}): ${params.topicTitle}.\n${enhanceBlock}\n\n` +
    'STRUKTURA (majburiy):\n' +
    '1) BIRINCHI slayd "Kirish" — faqat dars REJASI/temalar ro\'yxati (keyingi slaydlarning sarlavhalari). ' +
    'Har bullet = bitta tema nomi + 1 qisqa izoh (nima o\'rganiladi).\n' +
    '2) KEYINGI slaydlar — Kirishdagi HAR BIR tema bo\'yicha ALOHIDA slayd. ' +
    'Bu yerda qisqa bir qator fakt YAROQSIZ. Har bullet = 2-3 to\'liq gap (ta\'rif, mexanizm, misol, klinik ahamiyat). ' +
    `Har kontent-slaydda ${PRESENTATION_MIN_BULLETS}-8 ta BATAFSIL bullet (har biri kamida ${PRESENTATION_MIN_BULLET_CHARS} belgi).\n` +
    '3) Oxirgi slayd "Xulosa" — asosiy xulosalar + (kitob bo\'lsa) Manbalar.\n' +
    '"notes" — bullet\'larni TAKRORLAMA; o\'qituvchi uchun qo\'shimcha izoh (3-5 yangi gap) + manba.';

  const attempts: Array<{ maxTokens: number; temperature: number }> = [
    { maxTokens: 14000, temperature: 0.4 },
    { maxTokens: 12000, temperature: 0.3 },
  ];

  for (const attempt of attempts) {
    try {
      const raw = await openaiJson<Partial<PresentationDeck>>({
        model: OPENAI_CHAT,
        system:
          `${SYS_MEDICAL} Return ONLY valid JSON: ` +
          '{"title":"...","slides":[{"title":"...","bullets":["..."],"notes":"..."}]} . ' +
          `KAMIDA ${PRESENTATION_MIN_SLIDES} slayd. ` +
          'TAQIQLANGAN: bir qatorlik yuzaki faktlar ("X muhim", "Y keng tarqalgan") — bunday bullet\'lar YOZILMASIN. ' +
          'Har kontent-bullet chuqur: nima, nima uchun, qanday, klinik ahamiyati. ' +
          'Language: ' +
          outLang + '. ' +
          (bookContext
            ? 'MAJBURIY MANBA: faqat berilgan darslik parchalariga tayaning. Har kontent-slayd notes oxirida ' +
              '"(Manba: kitob nomi, sahifa-bet)". Tashqi DOI/PubMed qo\'shmang.'
            : 'MAJBURIY: tashqi havola / o\'ylab topilgan manba qo\'shmang.'),
        user: userPrompt,
        maxTokens: attempt.maxTokens,
        temperature: attempt.temperature,
        parse: (t) => parseJSONSafe<Partial<PresentationDeck>>(t),
        bookContext,
      });
      const rawCount = Array.isArray(raw?.slides) ? raw.slides.length : 0;
      if (rawCount > 0 && rawCount < 6) {
        console.warn('Presentation AI returned too few slides, retrying…', rawCount);
        continue;
      }
      const deck = normalizePresentationDeck(raw, fallbackTitle);
      // Juda yuzaki slaydlar (o'rtacha bullet qisqa) — qayta urinish
      const contentSlides = deck.slides.slice(1);
      const avgLen =
        contentSlides.reduce(
          (sum, s) => sum + s.bullets.reduce((a, b) => a + b.length, 0) / Math.max(s.bullets.length, 1),
          0,
        ) / Math.max(contentSlides.length, 1);
      if (avgLen < PRESENTATION_MIN_BULLET_CHARS && attempt === attempts[0]) {
        console.warn('Presentation bullets too shallow, retrying…', Math.round(avgLen));
        continue;
      }
      return deck;
    } catch (error) {
      console.warn('Presentation AI attempt failed:', error);
    }
  }

  return normalizePresentationDeck(null, fallbackTitle);
}

export const aiService = {
  async extractSyllabusFromDocument(file: File): Promise<SyllabusExtractResult> {
    try {
      const docText = await extractSyllabusDocumentText(file);
      if (!docText.trim()) {
        throw new Error('empty-document');
      }
      return await extractSyllabusWithAi(file, docText);
    } catch (error) {
      console.error('Syllabus extraction failed:', error);
      throw error;
    }
  },

  async extractSyllabusTopics(file: File): Promise<SyllabusTopic[]> {
    const result = await aiService.extractSyllabusFromDocument(file);
    return result.topics;
  },

  async generateCaseStudy(
    topic: string,
    language: AppLanguage = 'uz',
    keywords: string[] = [],
    subjectCode?: string,
  ): Promise<CaseStudySession> {
    try {
      assertOpenAiApiKey();
      const outLang = languageName(language);
      const avoid = previousCaseAvoidBlock(topic);
      const keywordFocus = buildCaseKeywordsFocusPrompt(keywords);
      const bookContext: BookContext | undefined = subjectCode ? { subjectCode, topicQuery: topic } : undefined;

      const requestBatch = async (strict: boolean): Promise<CaseStudySession> => {
        const structure = buildCaseStructurePrompt(topic);
        return openaiJson({
          model: OPENAI_CHAT,
          system: `${SYS_MEDICAL} ${GENERATION_UNIQUENESS_RULE} 3 ta klinik case JSON: {topic, references:[], questions:[{focus:"profilaktika"|"davolash"|"tashxis", scenario, answer, references:[]}]}. Aynan 3 ta: 1-profilaktika, 2-davolash, 3-tashxis. Manba konteksti berilgan bo'lsa, "answer" matni ichida "(Manba: kitob nomi, sahifa-bet)" deb ko'rsating — JSON'dan tashqariga chiqarmang. Til: ${outLang}. ${jsonReferencesRule(Boolean(bookContext))}`,
          user: `${structure}${keywordFocus}${avoid}\n\nHar scenario 2-4 paragraf. Har answer fokusga mos. ${strict ? 'Maksimal sifat, faqat valid JSON.' : ''}`,
          maxTokens: 8192,
          temperature: strict ? 0.45 : 0.6,
          parse: (t) => parseJSONSafe<CaseStudySession>(t),
          bookContext,
        });
      };

      let questions: CaseStudyQuestion[];
      try {
        questions = await Promise.all(
          CASE_STUDY_FOCUS_ORDER.map((focus) =>
            generateSingleCaseQuestion(topic, focus, language, keywordFocus, avoid, subjectCode),
          ),
        );
      } catch (parallelError) {
        console.warn('Parallel case generation failed, trying batch:', parallelError);
        let data: CaseStudySession;
        try {
          data = await requestBatch(false);
        } catch {
          data = await requestBatch(true);
        }
        if (isWeakCaseSession(data)) {
          data = await requestBatch(true);
        }
        questions = data.questions || [];
      }

      const data: CaseStudySession = {
        topic,
        questions,
        references: [],
      };
      const normalized = normalizeCaseSession(topic, data);
      return keywords.length ? { ...normalized, keywords } : normalized;
    } catch (error) {
      console.error("Case study generation failed:", error);
      throw error;
    }
  },

  async generateTests(
    topic: string,
    count: number = 10,
    language: AppLanguage = 'uz',
    subjectCode?: string,
  ): Promise<TestSession> {
    assertOpenAiApiKey();
    const safeCount = Math.min(30, Math.max(10, Math.round(count) || 10));
    const outLang = languageName(language);
    const avoid = previousTestAvoidBlock(topic);
    const bookContext: BookContext | undefined = subjectCode ? { subjectCode, topicQuery: topic } : undefined;
    const generate = async (requestedCount: number, shortMode: boolean, strict: boolean): Promise<TestSession> => {
      const variety = buildTestVarietyPrompt(topic, requestedCount);
      const parsed = await openaiJson({
        model: OPENAI_CHAT,
        system: `${SYS_MEDICAL} ${GENERATION_UNIQUENESS_RULE} ${requestedCount} ta test JSON: {topic, references:[], questions:[{question, options[5], correctOptionIndex, explanation, optionExplanations[5], references:[]}]}. optionExplanations — options bilan bir xil tartibda, har biri uchun 1 gapli izoh: to'g'ri variant uchun nega to'g'ri, xato variantlar uchun nega xato (aynan shu variant nega noto'g'ri ekanini tushuntir, umumiy gap emas). Agar sizga darslik parchalari (manba konteksti) berilgan bo'lsa, shu parchalardan foydalangan har bir explanation/optionExplanations gapining oxiriga "(Manba: kitob nomi, sahifa-bet)" qo'shing — buni hech qachon JSON'dan tashqariga chiqarmang, faqat shu matn maydonlari ICHIDA yozing. Til: ${outLang}. ${jsonReferencesRule(Boolean(bookContext))}`,
        user: `${variety}${avoid}\n\n${requestedCount} ta NOYOB savol. Klinik vignette 3-6 gap, 5 ta teng variant, kuchli distraktorlar. explanation ${shortMode ? '2-3' : '3-5'} gap, hech qanday havola/manba raqami qo'shmasdan. optionExplanations: har bir variant uchun aniq, o'sha variantga xos 1 gapli sabab, manba asosida bo'lsa oxiriga (Manba: ..., ...-bet) qo'sh. ${strict ? 'Faqat valid JSON.' : ''}`,
        maxTokens: 6144,
        temperature: strict ? 0.42 : 0.68,
        parse: (t) => parseJSONSafe<TestSession>(t),
        bookContext,
      });
      return normalizeTestSession(topic, parsed, requestedCount);
    };

    const generateChunked = async (total: number): Promise<TestSession> => {
      const safeTotal = Math.max(1, total);
      const chunkSize = 4;
      let remaining = safeTotal;
      const merged: TestQuestion[] = [];
      while (remaining > 0) {
        const current = Math.min(chunkSize, remaining);
        const part = await generate(current, true, true);
        merged.push(...(part.questions || []).slice(0, current));
        remaining -= current;
      }
      return normalizeTestSession(topic, { topic, questions: merged }, safeTotal);
    };

    const base = await (async (): Promise<TestSession> => {
      try {
        let data: TestSession;
        try {
          data = await generate(safeCount, false, false);
        } catch {
          data = await generate(Math.min(safeCount, 10), true, true);
        }
        if (isWeakTestSession(data, safeCount)) {
          data = await generate(Math.min(safeCount, 10), true, true);
        }
        if (isWeakTestSession(data, safeCount)) {
          data = await generateChunked(safeCount);
        }
        return normalizeTestSession(topic, data, safeCount);
      } catch (error) {
        try {
          return await generateChunked(safeCount);
        } catch (fallbackError) {
          console.error("Test generation failed:", fallbackError);
          throw fallbackError;
        }
      }
    })();

    return attachTestTranslations(base, language);
  },

  async generateLectureNotes(
    topic: string,
    description: string = '',
    language: AppLanguage = 'uz',
    subjectCode?: string,
  ): Promise<LectureNote> {
    try {
      assertOpenAiApiKey();
      const outLang = languageName(language);
      const bookContext: BookContext | undefined = subjectCode ? { subjectCode, topicQuery: topic } : undefined;
      const content = await openaiText({
        model: OPENAI_CHAT,
        system: `${SYS_MEDICAL} Ma'ruza faqat Markdown. HAJM: qisqa konspekt EMAS — real 60-90 daqiqalik ` +
          'universitet ma\'ruzasi (taxminan 3500-6000 so\'z yoki undan ko\'p). ' +
          'Tuzilma majburiy: # sarlavha; ## Kirish (ahamiyat, maqsad, reja — kamida 3-4 paragraf); ' +
          'kamida 7-9 ta ## asosiy bo\'lim (har birida kamida 4-6 to\'liq paragraf + kerak bo\'lsa ### ' +
          'va ro\'yxatlar; ta\'rif, mexanizm, tasnif, misol); ## Klinik / amaliy qo\'llash (kamida 3-4 ' +
          'paragraf); ## Xulosa (asosiy xulosalar). Sayoz umumiy gaplar bilan cheklanmang — chuqur ' +
          'tushuntiring, ta\'rif va misollarni ochib yozing. ' +
          (bookContext
            ? 'Berilgan darslik parchalaridagi BARCHA tegishli tafsilotlardan to\'liq foydalaning — ' +
              'qisqartirmasdan, kengaytirib tushuntiring. HAR BIR ## bo\'limda kamida bitta ' +
              '"(Manba: kitob nomi, sahifa-bet)" ko\'rsating.'
            : 'Tashqi havola yoki o\'ylab topilgan manba qo\'shmang.'
          ) + ` ${textReferencesRule(Boolean(bookContext))} Til: ${outLang}.`,
        user:
          `Mavzu: "${topic}". Qo'shimcha: ${description || '—'}. ` +
          'UZUN va BATAFSIL ma\'ruza matni yozing — qisqa xulosa yoki tezislar emas. ' +
          'Kamida 7 ta asosiy bo\'lim, har biri bir necha to\'liq paragraf. ' +
          (bookContext
            ? 'Darslik manbalarini matn ichida (Manba: ...) ko\'rsating va oxirida ## Manbalar qo\'shing.'
            : ''),
        maxTokens: 16000,
        temperature: 0.4,
        bookContext,
      });

      return {
        topic: topic,
        content: content || ''
      };
    } catch (error) {
      console.error("Lecture Note generation failed:", error);
      throw error;
    }
  },

  async generateImagePrompt(title: string, content: string[]): Promise<string> {
    try {
      const text = await openaiText({
        model: OPENAI_FAST,
        system: 'One English image prompt for medical slide. Output prompt only, no quotes.',
        user: `Title: ${title}\nBullets:\n${content.join('\n')}`,
        maxTokens: 200,
        temperature: 0.5,
      });
      return text.trim();
    } catch (error) {
      console.error(error);
      return `Professional medical illustration for: ${title}`;
    }
  },

  async generateExercises(topic: string): Promise<Exercise> {
    try {
      return openaiJson({
        model: OPENAI_CHAT,
        system: `${SYS_MEDICAL} JSON: {title, description, tasks:[{task, type, options?, answer}]}. Til: O'zbek.`,
        user: `Mavzu: "${topic}". Interaktiv mashqlar.`,
        maxTokens: 2048,
        parse: (t) => parseJSONSafe<Exercise>(t),
      });
    } catch (error) {
      console.error("Exercise generation failed:", error);
      throw error;
    }
  },

  async generatePresentationDeck(params: {
    topicTitle: string;
    topicId: string;
    topicType: 'lecture' | 'practical';
    subjectName: string;
    variantLabel: string;
    language: AppLanguage;
    mode: 'generate' | 'enhance';
    sourceFileName?: string;
    sourceText?: string;
    subjectCode?: string;
  }): Promise<PresentationDeck> {
    return requestPresentationDeckFromAi(params);
  },

  async generateImage(_prompt: string): Promise<string | null> {
    // Maxfiylik: tashqi rasm generatsiya servislari o‘chirilgan (pollinations.ai).
    return null;
  },
};
