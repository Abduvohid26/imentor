import { type AppLanguage, inferPdfLanguage } from '../i18n/language';
import { translate } from '../i18n/translations';
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
  references?: MedicalReference[];
}

export interface TestSession {
  id?: string;
  topic: string;
  questions: TestQuestion[];
  references?: MedicalReference[];
  createdAt?: number;
  authorUid?: string;
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
): Promise<CaseStudyQuestion> {
  const outLang = languageName(language);
  const structure = buildCaseStructurePrompt(topic);
  const request = (strict: boolean) =>
    openaiJson<{ scenario?: string; answer?: string; references?: MedicalReference[]; focus?: string }>({
      model: OPENAI_CHAT,
      system:
        `${SYS_MEDICAL} ${GENERATION_UNIQUENESS_RULE} Return ONLY valid JSON object: ` +
        `{"scenario":"...","answer":"...","references":[{"title":"...","url":"https://..."}]}. ` +
        `Language: ${outLang}. focus="${focus}". ${MEDICAL_REFERENCES_AI_RULES}`,
      user:
        `${structure}${keywordFocus}${avoid}\n\n` +
        `Generate ONE clinical case with focus="${focus}" (${CASE_FOCUS_HINTS[focus]}). ` +
        'Scenario: 2–4 paragraphs with patient details. Answer: 2–4 paragraphs, focus-specific clinical reasoning. ' +
        'Include 2 references in JSON. End answer with [1][2] style citations. ' +
        (strict ? 'Strict valid JSON only.' : ''),
      maxTokens: 3072,
      temperature: strict ? 0.4 : 0.58,
      parse: (t) => parseJSONSafe(t),
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
    ...(normalizeMedicalReferences(raw.references, topic).length
      ? { references: normalizeMedicalReferences(raw.references, topic) }
      : {}),
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
      const refs = normalizeMedicalReferences(q.references, topic);
      const focus = normalizeCaseFocus((q as CaseStudyQuestion).focus, i);
      return {
        scenario: scenario.length >= 120 ? scenario : fallbackScenario,
        answer: answer.length >= 120 ? answer : fallbackAnswer,
        focus,
        ...(refs.length ? { references: refs } : {}),
      };
    });
  const sessionRefs = normalizeMedicalReferences(data.references, topic);
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
      const refs = normalizeMedicalReferences(q.references, topic);
      return {
        question: (q.question || '').trim(),
        options: options.map((o) => (o || '').trim()),
        explanation: (q.explanation || '').trim(),
        correctOptionIndex,
        ...(refs.length ? { references: refs } : {}),
      };
    });
  const sessionRefs = normalizeMedicalReferences(data.references, topic);
  const allQRefs = questions.flatMap((q) => q.references || []);
  return {
    ...data,
    topic: (data.topic || topic || '').trim() || topic,
    questions,
    references: mergeReferences(sessionRefs, allQRefs),
  };
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
    keywords: string[] = []
  ): Promise<CaseStudySession> {
    try {
      assertOpenAiApiKey();
      const outLang = languageName(language);
      const avoid = previousCaseAvoidBlock(topic);
      const keywordFocus = buildCaseKeywordsFocusPrompt(keywords);

      const requestBatch = async (strict: boolean): Promise<CaseStudySession> => {
        const structure = buildCaseStructurePrompt(topic);
        return openaiJson({
          model: OPENAI_CHAT,
          system: `${SYS_MEDICAL} ${GENERATION_UNIQUENESS_RULE} 3 ta klinik case JSON: {topic, references:[...], questions:[{focus:"profilaktika"|"davolash"|"tashxis", scenario, answer, references:[...]}]}. Aynan 3 ta: 1-profilaktika, 2-davolash, 3-tashxis. Til: ${outLang}. ${MEDICAL_REFERENCES_AI_RULES}`,
          user: `${structure}${keywordFocus}${avoid}\n\nHar scenario 2-4 paragraf. Har answer fokusga mos. Javob oxirida [1][2] iqtiboslar. ${strict ? 'Maksimal sifat, faqat valid JSON.' : ''}`,
          maxTokens: 8192,
          temperature: strict ? 0.45 : 0.6,
          parse: (t) => parseJSONSafe<CaseStudySession>(t),
        });
      };

      let questions: CaseStudyQuestion[];
      try {
        questions = await Promise.all(
          CASE_STUDY_FOCUS_ORDER.map((focus) =>
            generateSingleCaseQuestion(topic, focus, language, keywordFocus, avoid),
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
        ...questions.map((q) => normalizeMedicalReferences(q.references, topic)),
      );
      const data: CaseStudySession = {
        topic,
        questions,
        references: sessionRefs,
      };
      const normalized = normalizeCaseSession(topic, data);
      return keywords.length ? { ...normalized, keywords } : normalized;
    } catch (error) {
      console.error("Case study generation failed:", error);
      throw error;
    }
  },

  async generateTests(topic: string, count: number = 10, language: AppLanguage = 'uz'): Promise<TestSession> {
    assertOpenAiApiKey();
    const outLang = languageName(language);
    const avoid = previousTestAvoidBlock(topic);
    const generate = async (requestedCount: number, shortMode: boolean, strict: boolean): Promise<TestSession> => {
      const variety = buildTestVarietyPrompt(topic, requestedCount);
      const parsed = await openaiJson({
        model: OPENAI_CHAT,
        system: `${SYS_MEDICAL} ${GENERATION_UNIQUENESS_RULE} ${requestedCount} ta test JSON: {topic, references:[{title,authors,year,publisher,url}], questions:[{question, options[5], correctOptionIndex, explanation, references:[...]}]}. Til: ${outLang}. ${MEDICAL_REFERENCES_AI_RULES}`,
        user: `${variety}${avoid}\n\n${requestedCount} ta NOYOB savol. Klinik vignette 3-6 gap, 5 ta teng variant, kuchli distraktorlar. explanation ${shortMode ? '2-3' : '3-5'} gap — oxirida [1][2] iqtiboslar. ${strict ? 'Faqat valid JSON.' : ''}`,
        maxTokens: 4096,
        temperature: strict ? 0.42 : 0.68,
        parse: (t) => parseJSONSafe<TestSession>(t),
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

    try {
      let data: TestSession;
      try {
        data = await generate(count, false, false);
      } catch {
        data = await generate(Math.min(count, 10), true, true);
      }
      if (isWeakTestSession(data, count)) {
        data = await generate(Math.min(count, 10), true, true);
      }
      if (isWeakTestSession(data, count)) {
        data = await generateChunked(Math.min(count, 12));
      }
      return normalizeTestSession(topic, data, count);
    } catch (error) {
      try {
        return await generateChunked(Math.min(count, 12));
      } catch (fallbackError) {
        console.error("Test generation failed:", fallbackError);
        throw fallbackError;
      }
    }
  },

  async generateLectureNotes(topic: string, description: string = '', language: AppLanguage = 'uz'): Promise<LectureNote> {
    try {
      assertOpenAiApiKey();
      const outLang = languageName(language);
      const content = await openaiText({
        model: OPENAI_CHAT,
        system: `${SYS_MEDICAL} Ma'ruza faqat Markdown. Kirish, 3-4 bo'lim, klinik qo'llash, xulosa. Matn ichida muhim faktlar yonida [manba](url) havolalari. ${LECTURE_REFERENCES_AI_RULES} Til: ${outLang}.`,
        user: `Mavzu: "${topic}". Qo'shimcha: ${description || '—'}. Batafsil ma'ruza matni. Har bo'limda ilmiy dalillar va havolalar bo'lsin.`,
        maxTokens: 8192,
        temperature: 0.4,
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

  async generateImage(_prompt: string): Promise<string | null> {
    // Maxfiylik: tashqi rasm generatsiya servislari o‘chirilgan (pollinations.ai).
    return null;
  },
};
