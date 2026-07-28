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
import {
  LECTURE_REFERENCES_AI_RULES,
  MEDICAL_REFERENCES_AI_RULES,
  mergeReferences,
  normalizeMedicalReferences,
  type MedicalReference,
} from '../utils/medicalReferences';

// Kitob (bookContext) mavjud bo'lsa, tashqi (DOI/PubMed) adabiyotlar ro'yxati talab qilinmaydi —
// bular ko'pincha AI tomonidan o'ylab topiladi (haqiqiy maqolaga bog'lanmasligi mumkin) va
// foydalanuvchi faqat darslikka asoslangan kontent so'ragan.
const NO_EXTERNAL_REFS_JSON_RULE =
  'MAJBURIY: bu fan uchun rasmiy darslik (kitob) manba sifatida berilgan. Tashqi adabiyot/DOI/PubMed ' +
  'havolalari QO\'SHMANG — "references" maydonini bo\'sh massiv [] qoldiring. Manba faqat matn ichida ' +
  '(Manba: kitob nomi, sahifa-bet) ko\'rinishida bo\'lsin.';
const NO_EXTERNAL_REFS_TEXT_RULE =
  'MAJBURIY: bu fan uchun rasmiy darslik (kitob) manba sifatida berilgan. Oxirida ' +
  '"## Foydalanilgan adabiyotlar" bo\'limini YOZMANG va tashqi (DOI/PubMed) havolalar qo\'shmang — ' +
  'faqat matn ichida (Manba: kitob nomi, sahifa-bet) ko\'rsating.';

function jsonReferencesRule(hasBookContext: boolean): string {
  return hasBookContext ? NO_EXTERNAL_REFS_JSON_RULE : MEDICAL_REFERENCES_AI_RULES;
}

function textReferencesRule(hasBookContext: boolean): string {
  return hasBookContext ? NO_EXTERNAL_REFS_TEXT_RULE : LECTURE_REFERENCES_AI_RULES;
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
  const request = (strict: boolean) =>
    openaiJson<{ scenario?: string; answer?: string; references?: MedicalReference[]; focus?: string }>({
      model: OPENAI_CHAT,
      system:
        `${SYS_MEDICAL} ${GENERATION_UNIQUENESS_RULE} Return ONLY valid JSON object: ` +
        `{"scenario":"...","answer":"...","references":[{"title":"...","url":"https://..."}]}. ` +
        `If book excerpts (manba context) were given, cite them inside "answer" text as "(Manba: kitob nomi, sahifa-bet)" — never outside the JSON. ` +
        `Language: ${outLang}. focus="${focus}". ${jsonReferencesRule(Boolean(bookContext))}`,
      user:
        `${structure}${keywordFocus}${avoid}\n\n` +
        `Generate ONE clinical case with focus="${focus}" (${CASE_FOCUS_HINTS[focus]}). ` +
        'Scenario: 2–4 paragraphs with patient details. Answer: 2–4 paragraphs, focus-specific clinical reasoning. ' +
        'Include 2 references in JSON. End answer with [1][2] style citations. ' +
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

  const refFallbackTopic = bookContext ? undefined : topic;
  return {
    scenario: (raw.scenario || '').trim(),
    answer: (raw.answer || '').trim(),
    focus: normalizeCaseFocus(raw.focus, CASE_STUDY_FOCUS_ORDER.indexOf(focus)),
    ...(normalizeMedicalReferences(raw.references, refFallbackTopic).length
      ? { references: normalizeMedicalReferences(raw.references, refFallbackTopic) }
      : {}),
  };
}

function normalizeCaseSession(
  topic: string,
  data: CaseStudySession,
  hasBookContext = false,
): CaseStudySession {
  const refFallbackTopic = hasBookContext ? undefined : topic;
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
      const refs = normalizeMedicalReferences(q.references, refFallbackTopic);
      const focus = normalizeCaseFocus((q as CaseStudyQuestion).focus, i);
      return {
        scenario: scenario.length >= 120 ? scenario : fallbackScenario,
        answer: answer.length >= 120 ? answer : fallbackAnswer,
        focus,
        ...(refs.length ? { references: refs } : {}),
      };
    });
  const sessionRefs = normalizeMedicalReferences(data.references, refFallbackTopic);
  const allQRefs = cleanedQuestions.flatMap((q) => q.references || []);
  return {
    topic: (data.topic || topic || '').trim() || topic,
    questions: cleanedQuestions,
    references: mergeReferences(sessionRefs, allQRefs),
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

function normalizeTestSession(
  topic: string,
  data: TestSession,
  requestedCount: number,
  hasBookContext = false,
): TestSession {
  const refFallbackTopic = hasBookContext ? undefined : topic;
  const questions = (data.questions || [])
    .slice(0, requestedCount)
    .map((q) => {
      const options = (q.options || []).slice(0, 5);
      while (options.length < 5) options.push(`Variant ${options.length + 1}`);
      const correctOptionIndex =
        typeof q.correctOptionIndex === 'number' && q.correctOptionIndex >= 0 && q.correctOptionIndex < 5
          ? q.correctOptionIndex
          : 0;
      const refs = normalizeMedicalReferences(q.references, refFallbackTopic);
      const optionExplanations = (q.optionExplanations || []).slice(0, 5).map((e) => (e || '').trim());
      while (optionExplanations.length < 5) optionExplanations.push('');
      const hasOptionExplanations = optionExplanations.some((e) => e.length > 0);
      return {
        question: (q.question || '').trim(),
        options: options.map((o) => (o || '').trim()),
        explanation: (q.explanation || '').trim(),
        correctOptionIndex,
        ...(hasOptionExplanations ? { optionExplanations } : {}),
        ...(refs.length ? { references: refs } : {}),
      };
    });
  const sessionRefs = normalizeMedicalReferences(data.references, refFallbackTopic);
  const allQRefs = questions.flatMap((q) => q.references || []);
  return {
    ...data,
    topic: (data.topic || topic || '').trim() || topic,
    questions,
    references: mergeReferences(sessionRefs, allQRefs),
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
        .filter((b) => b.length > 4)
        .slice(0, 8);
      const notes = String(s?.notes || '').trim();
      if (!st || bullets.length === 0) return null;
      return { title: st.slice(0, 120), bullets, notes: notes || undefined };
    })
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  if (slides.length >= 4) return { title, slides: slides.slice(0, 16) };

  return {
    title,
    slides: [
      { title: fallbackTitle, bullets: ['Mavzu kirish', 'Asosiy tushunchalar', 'Klinik ahamiyat'] },
      { title: 'Etiologiya va patogenez', bullets: ['Sabablar', 'Mexanizm', 'Xavf omillari'] },
      { title: 'Tashxis', bullets: ['Anamnez', 'Ko\'rik', 'Instrumental tekshiruvlar'] },
      { title: 'Davolash va profilaktika', bullets: ['Konservativ', 'Operativ', 'Profilaktika'] },
    ],
  };
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
    `Mavzu ${params.topicId} (${kind}): ${params.topicTitle}.\n${enhanceBlock}`;

  const attempts: Array<{ maxTokens: number; temperature: number }> = [
    { maxTokens: 6144, temperature: 0.55 },
    { maxTokens: 4096, temperature: 0.4 },
  ];

  for (const attempt of attempts) {
    try {
      const raw = await openaiJson<Partial<PresentationDeck>>({
        model: OPENAI_CHAT,
        system:
          `${SYS_MEDICAL} Return ONLY valid JSON: ` +
          '{"title":"...","slides":[{"title":"...","bullets":["..."],"notes":"..."}]} . ' +
          '8-12 slides for university medical class. Each slide 3-6 concise bullets. Language: ' +
          outLang + '. ' +
          (bookContext
            ? 'MAJBURIY: bu fan uchun rasmiy darslik (kitob) manba sifatida berilgan. Faqat shu darslik ' +
              'parchalaridagi ma\'lumotlarga asoslaning, tashqi/umumiy bilimingizdan fakt qo\'shmang. ' +
              'Har bir slaydning "notes" maydoni oxiriga foydalangan manbani "(Manba: kitob nomi, sahifa-bet)" ' +
              'formatida qo\'shing.'
            : ''),
        user: userPrompt,
        maxTokens: attempt.maxTokens,
        temperature: attempt.temperature,
        parse: (t) => parseJSONSafe<Partial<PresentationDeck>>(t),
        bookContext,
      });
      return normalizePresentationDeck(raw, fallbackTitle);
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
          system: `${SYS_MEDICAL} ${GENERATION_UNIQUENESS_RULE} 3 ta klinik case JSON: {topic, references:[...], questions:[{focus:"profilaktika"|"davolash"|"tashxis", scenario, answer, references:[...]}]}. Aynan 3 ta: 1-profilaktika, 2-davolash, 3-tashxis. Manba konteksti berilgan bo'lsa, "answer" matni ichida "(Manba: kitob nomi, sahifa-bet)" deb ko'rsating — JSON'dan tashqariga chiqarmang. Til: ${outLang}. ${jsonReferencesRule(Boolean(bookContext))}`,
          user: `${structure}${keywordFocus}${avoid}\n\nHar scenario 2-4 paragraf. Har answer fokusga mos. Javob oxirida [1][2] iqtiboslar. ${strict ? 'Maksimal sifat, faqat valid JSON.' : ''}`,
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

      const sessionRefs = mergeReferences(
        ...questions.map((q) => normalizeMedicalReferences(q.references, bookContext ? undefined : topic)),
      );
      const data: CaseStudySession = {
        topic,
        questions,
        references: sessionRefs,
      };
      const normalized = normalizeCaseSession(topic, data, Boolean(bookContext));
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
        system: `${SYS_MEDICAL} ${GENERATION_UNIQUENESS_RULE} ${requestedCount} ta test JSON: {topic, references:[{title,authors,year,publisher,url}], questions:[{question, options[5], correctOptionIndex, explanation, optionExplanations[5], references:[...]}]}. optionExplanations — options bilan bir xil tartibda, har biri uchun 1 gapli izoh: to'g'ri variant uchun nega to'g'ri, xato variantlar uchun nega xato (aynan shu variant nega noto'g'ri ekanini tushuntir, umumiy gap emas). Agar sizga darslik parchalari (manba konteksti) berilgan bo'lsa, shu parchalardan foydalangan har bir explanation/optionExplanations gapining oxiriga "(Manba: kitob nomi, sahifa-bet)" qo'shing — buni hech qachon JSON'dan tashqariga chiqarmang, faqat shu matn maydonlari ICHIDA yozing. Til: ${outLang}. ${jsonReferencesRule(Boolean(bookContext))}`,
        user: `${variety}${avoid}\n\n${requestedCount} ta NOYOB savol. Klinik vignette 3-6 gap, 5 ta teng variant, kuchli distraktorlar. explanation ${shortMode ? '2-3' : '3-5'} gap — oxirida [1][2] iqtiboslar. optionExplanations: har bir variant uchun aniq, o'sha variantga xos 1 gapli sabab, manba asosida bo'lsa oxiriga (Manba: ..., ...-bet) qo'sh. ${strict ? 'Faqat valid JSON.' : ''}`,
        maxTokens: 6144,
        temperature: strict ? 0.42 : 0.68,
        parse: (t) => parseJSONSafe<TestSession>(t),
        bookContext,
      });
      return normalizeTestSession(topic, parsed, requestedCount, Boolean(bookContext));
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
      return normalizeTestSession(topic, { topic, questions: merged }, safeTotal, Boolean(bookContext));
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
        return normalizeTestSession(topic, data, safeCount, Boolean(bookContext));
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
        system: `${SYS_MEDICAL} Ma'ruza faqat Markdown. Kirish, 3-4 bo'lim, klinik qo'llash, xulosa. ${
          bookContext
            ? 'Matn ichida muhim faktlar yonida "(Manba: kitob nomi, sahifa-bet)" formatida ko\'rsating — hech qachon "manba" so\'zini yolg\'iz, qavs/havolasiz qoldirmang.'
            : 'Matn ichida muhim faktlar yonida [manba](url) havolalari.'
        } ${textReferencesRule(Boolean(bookContext))} Til: ${outLang}.`,
        user: `Mavzu: "${topic}". Qo'shimcha: ${description || '—'}. Batafsil ma'ruza matni. Har bo'limda ilmiy dalillar va havolalar bo'lsin.`,
        maxTokens: 8192,
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
