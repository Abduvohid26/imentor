import { type AppLanguage, inferPdfLanguage } from '../i18n/language';
import { translate } from '../i18n/translations';
import type { PresentationContent } from '../utils/presentationContentSchema';
import {
  PRESENTATION_JSON_SCHEMA,
  normalizePresentationContent,
} from '../utils/presentationContentSchema';
import { qaPresentationContent } from '../utils/presentationQa';
import { resolvePresentationImages } from '../utils/presentationImages';
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
  openaiTextStream,
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
import { listPreparedForTopicSynced, loadPreparedByIdSynced } from '../utils/preparedContentStore';
import { normalizeCaseFocus } from '../utils/caseFocusLabels';
import { type MedicalReference } from '../utils/medicalReferences';
import { stripUnfilledSourceTemplate } from '../utils/sourceTemplate';
import { httpJson } from '../api/httpClient';
import { ensureBackendAccessToken, getBackendAccessToken } from '../utils/backendAuth';

// Hech qachon tashqi (DOI/PubMed/veb) havola yoki "Foydalanilgan adabiyotlar" ro'yxati so'ralmaydi —
// bular ko'pincha AI tomonidan o'ylab topiladi (haqiqiy maqolaga bog'lanmasligi mumkin). Kitob
// konteksti bo'lsa — manba matn ichida (Manba: kitob, sahifa-bet) ko'rinishida ko'rsatiladi;
// bo'lmasa — hech qanday manba/havola ko'rsatilmaydi, faqat mazmun.
const NO_EXTERNAL_REFS_JSON_RULE_BOOK =
  'MAJBURIY: bu fan uchun rasmiy darslik (kitob) manba sifatida berilgan. Tashqi adabiyot/DOI/PubMed ' +
  'havolalari QO\'SHMANG — "references" maydonini bo\'sh massiv [] qoldiring (manbani tizim ' +
  'AVTOMATIK biriktiradi: qaysi darslikning qaysi betlari ishlatilgani serverga aniq ma\'lum). ' +
  'Matn ichida ham "(Manba: ...)" YOZMANG — ayniqsa "kitob nomi", "sahifa-bet" kabi ' +
  'TO\'LDIRILMAGAN shablonni hech qachon qoldirmang. Faqat mazmunni yozing.';
const NO_EXTERNAL_REFS_JSON_RULE_NOBOOK =
  'MAJBURIY: tashqi adabiyot/DOI/PubMed/veb havolalari yoki o\'ylab topilgan manbalar QO\'SHMANG — ' +
  '"references" maydonini bo\'sh massiv [] qoldiring. Hech qanday manba ko\'rsatmasdan, faqat ' +
  'mazmunning o\'ziga tayanib yozing.';
const NO_EXTERNAL_REFS_TEXT_RULE_BOOK =
  'MAJBURIY: bu fan uchun rasmiy darslik (kitob) manba sifatida berilgan. Tashqi (DOI/PubMed/veb) ' +
  'havolalar QO\'SHMANG. Har bir asosiy bo\'limda kamida 1 marta "(Manba: <HAQIQIY kitob nomi>, ' +
  '<HAQIQIY sahifa raqami>)" ko\'rsating — bu FORMAT namunasi, matndagi "<...>" belgilarini berilgan ' +
  'darslik parchasidagi HAQIQIY kitob nomi va sahifa raqami bilan almashtiring. "kitob nomi", ' +
  '"sahifa-bet" kabi TO\'LDIRILMAGAN/umumiy so\'zlarni hech qachon o\'zgarishsiz qoldirmang — agar ' +
  'aniq kitob nomi/sahifa nomalum bo\'lsa, manba qatorini butunlay tashlab keting. Oxirida qisqa ' +
  '"## Manbalar" bo\'limida FAQAT berilgan darsliklardan foydalanilgan kitoblar ro\'yxatini yozing ' +
  '(tashqi adabiyot qo\'shmang).';
const NO_EXTERNAL_REFS_TEXT_RULE_NOBOOK =
  'MAJBURIY: oxirida "## Foydalanilgan adabiyotlar" / "## Manbalar" bo\'limini YOZMANG, tashqi ' +
  '(DOI/PubMed/veb) havolalar yoki o\'ylab topilgan manbalar qo\'shmang — hech qanday link/manba ' +
  'ko\'rsatmasdan, faqat mazmunning o\'ziga tayanib yozing.';

/** Xavfsizlik to'ri: AI ba'zan ko'rsatma ichidagi TO'LDIRILMAGAN namuna
 * matnini ("kitob nomi, sahifa-bet") o'zgarishsiz qaytarib yuboradi — bu
 * haqiqiy manba emas. Promptga qo'shilgan ogohlantirish asosiy himoya,
 * lekin shu funksiya oxirgi chiziq sifatida shunday qatorlarni matndan
 * butunlay olib tashlaydi. */
function stripPlaceholderManba(text: string): string {
  if (!text) return text;
  return text
    .split('\n')
    .filter((line) => !/\(?Manba:\s*kitob\s*nomi/i.test(line))
    .join('\n');
}

function jsonReferencesRule(hasBookContext: boolean): string {
  return hasBookContext ? NO_EXTERNAL_REFS_JSON_RULE_BOOK : NO_EXTERNAL_REFS_JSON_RULE_NOBOOK;
}

function textReferencesRule(hasBookContext: boolean): string {
  return hasBookContext ? NO_EXTERNAL_REFS_TEXT_RULE_BOOK : NO_EXTERNAL_REFS_TEXT_RULE_NOBOOK;
}

async function previousCaseAvoidBlock(topic: string): Promise<string> {
  try {
    const summaries = (await listPreparedForTopicSynced('case', topic)).slice(0, 6);
    const sessions = (
      await Promise.all(summaries.map((v) => loadPreparedByIdSynced<CaseStudySession>('case', v.id)))
    ).filter((s): s is CaseStudySession => Boolean(s?.questions?.length));
    return buildAvoidRepeatsBlock(sessions.map(summarizeCaseForAvoid));
  } catch {
    return '';
  }
}

async function previousTestAvoidBlock(topic: string): Promise<string> {
  try {
    // Tezlik: to'liq payload yuklamaymiz — faqat sarlavhalar (mine list).
    const summaries = (await listPreparedForTopicSynced('test', topic)).slice(0, 8);
    if (!summaries.length) return '';
    const lines = summaries.map((s, i) => `${i + 1}. ${s.topic}`).join('\n');
    return (
      `\nAvoid repeating these previously generated test topics / angles:\n${lines}\n` +
      'Create NEW clinical vignettes and distractors.\n'
    );
  } catch {
    return '';
  }
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
  /** Asosiy generatsiya tili — `questions` shu tilda; boshqalari `translations`da. */
  primaryLanguage?: AppLanguage;
  /** Qolgan tillardagi tarjimalar (uz/ru/en to'liq to'plami uchun). */
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

const CASE_FOCUS_HINTS: Record<CaseStudyFocus, string> = {
  profilaktika: 'profilaktika, skrining, xavf omillarini boshqarish, kasallikni oldini olish',
  davolash: 'davolash strategiyasi, dori tanlash, kuzatuv, asoratlarni kamaytirish',
  tashxis: 'differensial tashxis, qo\'shimcha tekshiruvlar, klinik mantiq, tashxisni asoslash',
};

/** Har fokus uchun MAJBURIY, bir-biriga o'xshamaydigan bemor profili — 3 ta
 * vaziyat parallel generatsiya qilingani uchun (bir-biridan xabarsiz), aynan
 * shu qat'iy demografik farq bo'lmasa, model ko'pincha bir xil ism/yosh/kasb
 * tanlaydi (masalan hammasi "Anvar"). */
const CASE_PERSONA_HINTS: Record<CaseStudyFocus, string> = {
  profilaktika:
    'Bemor: YOSH (20-35 yosh) AYOL, aniq kasbi bo\'lsin (masalan talaba, sotuvchi, muhandis). ' +
    'Ism — kam uchraydigan, o\'ziga xos o\'zbekcha ism tanlang (Anvar/Nigora/Shirin/Gulnora kabi ' +
    'juda keng tarqalgan ismlardan QOCHING).',
  davolash:
    'Bemor: O\'RTA YOSHLI (40-55 yosh) ERKAK, aniq kasbi bo\'lsin (masalan haydovchi, dehqon, ' +
    'tadbirkor). Ism — kam uchraydigan, o\'ziga xos o\'zbekcha ism tanlang (Anvar/Nigora/Shirin/' +
    'Gulnora kabi juda keng tarqalgan ismlardan QOCHING).',
  tashxis:
    'Bemor: KEKSA (60-75 yosh), jinsi ixtiyoriy, nafaqaga chiqqan yoki hali ishlaydigan bo\'lishi ' +
    'mumkin. Ism — kam uchraydigan, o\'ziga xos o\'zbekcha ism tanlang (Anvar/Nigora/Shirin/Gulnora ' +
    'kabi juda keng tarqalgan ismlardan QOCHING).',
};

async function generateSingleCaseQuestion(
  topic: string,
  focus: CaseStudyFocus,
  language: AppLanguage,
  keywordFocus: string,
  avoid: string,
  contextText: string,
  sources: CaseSource[],
): Promise<CaseStudyQuestion> {
  const outLang = languageName(language);
  const structure = buildCaseStructurePrompt(topic);
  const hasContext = Boolean(contextText.trim());
  const request = (strict: boolean) =>
    openaiJson<{ scenario?: string; answer?: string; focus?: string }>({
      model: OPENAI_CHAT,
      system:
        `${SYS_MEDICAL} ${GENERATION_UNIQUENESS_RULE} Return ONLY valid JSON object: ` +
        `{"scenario":"...","answer":"..."}. Language: ${outLang}. focus="${focus}". ` +
        (hasContext
          ? 'MANBALAR (raqamlangan) sizga user xabarida berilgan — "answer" matnida HAR bir muhim klinik ' +
            'da\'vodan keyin mos manba raqamini [n] shaklida qo\'ying (masalan "...tavsiya etiladi [2]."). ' +
            'Manbada bo\'lmagan narsani manba raqami bilan bog\'lamang; agar manbada yetarli ma\'lumot bo\'lmasa, ' +
            'ochiq tan oling ("berilgan manbalarda aniq ma\'lumot yo\'q, umumiy klinik amaliyotga asoslanib...") ' +
            'va bu qismni raqamsiz qoldiring. HECH QACHON o\'zingiz PMID/DOI/link yoki manba raqami o\'ylab topmang — ' +
            'faqat sizga berilgan manbalar ro\'yxatidagi raqamlardan foydalaning. "Foydalanilgan adabiyotlar" ' +
            'bo\'limini o\'zingiz yozmang — u dasturiy ravishda alohida qo\'shiladi.'
          : 'Hech qanday manba berilmagan — hech qanday raqamli iqtibos [n], link yoki "Manba:" degan matn yozmang, faqat umumiy klinik bilim asosida yozing.'),
      user:
        `${structure}${keywordFocus}${avoid}\n\n` +
        `Generate ONE clinical case with focus="${focus}" (${CASE_FOCUS_HINTS[focus]}). ` +
        `${CASE_PERSONA_HINTS[focus]}\n` +
        'QATTIQ QOIDALAR:\n' +
        '1. "scenario" — KENGAYTIRILGAN, kamida 700-800 so\'z: bemor ismi/yoshi/jinsi/kasbi, batafsil ' +
        'anamnez (o\'tgan kasalliklar, oilaviy tarix, ijtimoiy holat, hayot tarzi), shikoyatlarning ' +
        'rivojlanish tarixi (qachon boshlangan, qanday kuchaygan, nima yaxshilaydi/yomonlashtiradi), ' +
        'to\'liq klinik ko\'rik topilmalari (tizim-tizim bo\'yicha: yurak-qon tomir, nafas, asab va h.k.), ' +
        'laborator/instrumental tekshiruv natijalari (aniq raqamlar bilan), ijtimoiy/oilaviy/psixologik ' +
        'kontekst — real, batafsil bemor tarixiga (case report) o\'xshash TO\'LIQ klinik rasm chizing, ' +
        'qisqartirmang.\n' +
        '2. "answer" — KENGAYTIRILGAN, kamida 1000-1200 so\'z, quyidagi tuzilishda (mos sarlavhalar ' +
        'bilan, focus\'ga qarab moslashtiring, har bo\'lim chuqur va batafsil, yuzaki emas):\n' +
        '   a) Dastlabki (taxminiy) tashxis va uning to\'liq klinik asoslanishi\n' +
        '   b) Differensial tashxis (kamida 3-4 muqobil tashxis, har biri uchun nega tanlangani/rad etilgani batafsil)\n' +
        '   c) Tavsiya etilgan qo\'shimcha tekshiruvlar (har biri uchun nima uchun kerakligi tushuntirilsin)\n' +
        '   d) Davolash/profilaktika taktikasi, bosqichma-bosqich (dozalar, muqobil variantlar, kuzatuv rejasi)\n' +
        '   e) Amaliy tavsiyalar (bemorga/ota-onaga) va uzoq muddatli prognoz/kuzatuv\n' +
        '3. Bu 3 ta vaziyatdan FAQAT BITTASI — qolgan ikkitasi boshqa bemor, boshqa ism, boshqa yosh/kasb ' +
        'bilan alohida generatsiya qilinmoqda. O\'zingizning vaziyatingiz ularnikidan butunlay farq qilishi ' +
        'shart: umumiy ismlardan (Anvar, Nigora, Shirin, Gulnora, Madina, Iskandar, Odil, Otabek kabi juda ' +
        'ko\'p ishlatiladigan ismlardan) qoching, o\'ziga xos ism tanlang.\n' +
        (hasContext ? `\nMANBALAR:\n${contextText}\n` : '') +
        (strict ? '\nStrict valid JSON only.' : ''),
      maxTokens: 11000,
      temperature: strict ? 0.45 : 0.65,
      parse: (t) => parseJSONSafe(t),
    });

  let raw: { scenario?: string; answer?: string; focus?: string };
  try {
    raw = await request(false);
  } catch {
    raw = await request(true);
  }

  const answer = (raw.answer || '').trim();
  const usedIndices = new Set(
    Array.from(answer.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1])),
  );
  const citedSources = sources.filter((s) => usedIndices.has(s.index));
  const referencesSection = buildReferencesSection(citedSources.length ? citedSources : []);

  return {
    scenario: (raw.scenario || '').trim(),
    answer: answer + referencesSection,
    focus: normalizeCaseFocus(raw.focus, CASE_STUDY_FOCUS_ORDER.indexOf(focus)),
    ...(citedSources.length ? { references: sourcesToMedicalReferences(citedSources) } : {}),
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
      const refs = (q as CaseStudyQuestion).references;
      return {
        scenario: scenario.length >= 120 ? scenario : fallbackScenario,
        answer: answer.length >= 120 ? answer : fallbackAnswer,
        focus,
        ...(refs?.length ? { references: refs } : {}),
      };
    });
  return {
    topic: (data.topic || topic || '').trim() || topic,
    questions: cleanedQuestions,
    references: [],
  };
}

function normalizeTestSession(
  topic: string,
  data: TestSession,
  requestedCount: number,
  bookReferences: MedicalReference[] = [],
): TestSession {
  const questions = (data.questions || [])
    .slice(0, requestedCount)
    .map((q) => {
      const options = (q.options || []).slice(0, 5);
      while (options.length < 5) options.push(`Variant ${options.length + 1}`);
      const correctOptionIndex =
        typeof q.correctOptionIndex === 'number' && q.correctOptionIndex >= 0 && q.correctOptionIndex < 5
          ? q.correctOptionIndex
          : 0;
      const optionExplanations = (q.optionExplanations || [])
        .slice(0, 5)
        .map((e) => stripUnfilledSourceTemplate(e || ''));
      while (optionExplanations.length < 5) optionExplanations.push('');
      const hasOptionExplanations = optionExplanations.some((e) => e.length > 0);
      // Avval savolda bor manba (per-question), keyin umumiy bookReferences.
      const existingRefs = Array.isArray(q.references) ? q.references.filter((r) => r && (r.title || r.url)) : [];
      const refs = existingRefs.length ? existingRefs : bookReferences;
      return {
        question: (q.question || '').trim(),
        options: options.map((o) => (o || '').trim()),
        explanation: stripUnfilledSourceTemplate(q.explanation || ''),
        correctOptionIndex,
        ...(hasOptionExplanations ? { optionExplanations } : {}),
        ...(refs.length ? { references: refs } : {}),
      };
    });
  const sessionRefs =
    bookReferences.length > 0
      ? bookReferences
      : Array.from(
          new Map(
            questions
              .flatMap((q) => q.references || [])
              .filter((r) => r?.title || r?.url)
              .map((r) => [`${(r.title || '').toLowerCase()}|${r.pages || ''}|${r.url || ''}`, r]),
          ).values(),
        );
  return {
    ...data,
    topic: (data.topic || topic || '').trim() || topic,
    questions,
    references: sessionRefs,
  };
}

async function attachPerQuestionBookReferences(
  session: TestSession,
  subjectCode?: string,
): Promise<TestSession> {
  const code = (subjectCode || '').trim();
  const questions = session.questions || [];
  if (!code || !questions.length) return session;
  try {
    await ensureBackendAccessToken();
    const token = getBackendAccessToken();
    if (!token) return session;
    const data = await httpJson<{ results?: MedicalReference[][] }>(
      `${(import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL?.trim() || '/api'}/v1/education-ai/book-references/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        // MUHIM: httpJson body'ni o'zi JSON.stringify qiladi — bu yerda oldindan
        // stringify qilinsa, backend "string ichida string" qabul qilib 422
        // qaytaradi (shu bug tufayli test uchun per-savol kitob manbalari
        // sukut bo'yicha hech qachon ishlamagan edi).
        body: {
          subject_code: code,
          queries: questions.map((q) => q.question || ''),
          top_k: 3,
        },
      },
    );
    const results = Array.isArray(data.results) ? data.results : [];
    if (!results.length) return session;
    const nextQuestions = questions.map((q, i) => {
      const refs = Array.isArray(results[i]) ? results[i] : [];
      const cleaned = refs.filter((r) => r && (r.title || r.url));
      return cleaned.length ? { ...q, references: cleaned } : q;
    });
    return normalizeTestSession(session.topic || '', { ...session, questions: nextQuestions }, nextQuestions.length);
  } catch (err) {
    console.warn('Per-question book references failed, keeping session refs', err);
    return session;
  }
}

/** Keys (klinik vaziyat) uchun RAG manba — backend'dan REAL retrieval orqali
 * keladi (kitob chunk'i, PubMed/Semantic Scholar maqolasi yoki Wikipedia
 * maqolasi — ichki VA tashqi internet manbalari). LLM bu ro'yxatni o'zi
 * to'ldirmaydi — faqat shu manbalarni raqami bilan iqtibos qiladi
 * ([1], [2], ...), havolalar esa dasturiy ravishda, real API javobidan
 * biriktiriladi (Vikipediyadagi kabi ishonchli tashqi link'lar). */
export interface CaseSource {
  index: number;
  type: 'book' | 'pubmed' | 'scholar' | 'wikipedia';
  title: string;
  authors?: string;
  meta?: string;
  url?: string;
  text?: string;
}

async function fetchCaseContext(
  topic: string,
  subjectCode: string | undefined,
): Promise<{ sources: CaseSource[]; contextText: string }> {
  try {
    await ensureBackendAccessToken();
    const token = getBackendAccessToken();
    if (!token) return { sources: [], contextText: '' };
    const data = await httpJson<{ sources?: CaseSource[]; context_text?: string }>(
      `${apiBaseUrlForCase()}/v1/education-ai/case-context/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: { topic, subject_code: subjectCode || '' },
      },
    );
    return {
      sources: Array.isArray(data.sources) ? data.sources : [],
      contextText: data.context_text || '',
    };
  } catch (err) {
    console.warn('Case RAG context (book + PubMed/Semantic Scholar) fetch failed:', err);
    return { sources: [], contextText: '' };
  }
}

function apiBaseUrlForCase(): string {
  return (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL?.trim() || '/api';
}

/** `sources` ro'yxatidan haqiqiy metadata asosida (LLM ishtirokisiz) "Foydalanilgan
 * adabiyotlar" bo'limini quradi — havolalar 100% real, chunki API'dan olingan. */
function buildReferencesSection(sources: CaseSource[]): string {
  if (!sources.length) return '';
  const lines = sources.map((s) => {
    if (s.type === 'book') {
      return `[${s.index}] ${s.title}${s.meta ? `, ${s.meta}` : ''}`;
    }
    const kind = s.type === 'pubmed' ? 'PubMed' : s.type === 'wikipedia' ? 'Wikipedia' : 'Semantic Scholar';
    const authorBit = s.authors ? `${s.authors}. ` : '';
    const metaBit = s.meta ? ` (${s.meta})` : '';
    return `[${s.index}] ${authorBit}${s.title}${metaBit}. ${kind}: ${s.url || ''}`.trim();
  });
  return `\n\nFOYDALANILGAN ADABIYOTLAR:\n${lines.join('\n')}`;
}

function sourcePublisherLabel(type: CaseSource['type']): string {
  if (type === 'book') return 'Darslik';
  if (type === 'pubmed') return 'PubMed';
  if (type === 'wikipedia') return 'Wikipedia';
  return 'Semantic Scholar';
}

function sourcesToMedicalReferences(sources: CaseSource[]): MedicalReference[] {
  return sources.map((s) => ({
    title: s.title,
    ...(s.authors ? { authors: s.authors } : {}),
    publisher: sourcePublisherLabel(s.type),
    ...(s.url ? { url: s.url } : {}),
    ...(s.type === 'book' && s.meta ? { pages: s.meta.replace(/-bet$/, '') } : {}),
  }));
}

const ALL_TEST_LANGUAGES: AppLanguage[] = ['uz', 'ru', 'en'];

const UZ_TEXT_MARKERS = [
  'bemor',
  'yoshli',
  'qaysi',
  'ushbu',
  'hisoblanadi',
  'murojaat',
  'aniqlanadi',
  'tavsiya',
  "bo'lib",
  'shifokorga',
  'davosida',
  'maqbul',
];

function looksLikeUzbekText(text: string): boolean {
  const s = (text || '').toLowerCase();
  return UZ_TEXT_MARKERS.reduce((n, m) => n + (s.includes(m) ? 1 : 0), 0) >= 2;
}

function cyrillicCharCount(text: string): number {
  let n = 0;
  for (const ch of text || '') {
    const code = ch.charCodeAt(0);
    if (code >= 0x0400 && code <= 0x04ff) n += 1;
  }
  return n;
}

function toTestSessionContent(session: TestSessionContent): TestSessionContent {
  return {
    topic: session.topic,
    questions: session.questions,
    ...(session.references?.length ? { references: session.references } : {}),
  };
}

/**
 * Tarjima sifatini tekshiradi.
 * Eski bug: model yinish/bo'sh qaytarganda original (uz) matn `ru` deb saqlanardi.
 */
function isTestTranslationAcceptable(
  original: TestSessionContent,
  translated: TestSessionContent,
  targetLang: AppLanguage,
): boolean {
  const srcQs = original.questions || [];
  const dstQs = translated.questions || [];
  if (!srcQs.length || dstQs.length !== srcQs.length) return false;

  let identical = 0;
  let uzLooking = 0;
  let cyrillicQs = 0;
  let empty = 0;

  for (let i = 0; i < srcQs.length; i++) {
    const src = (srcQs[i]?.question || '').trim();
    const dst = (dstQs[i]?.question || '').trim();
    const opts = dstQs[i]?.options || [];
    if (!dst || opts.length !== (srcQs[i]?.options || []).length) {
      empty += 1;
      continue;
    }
    if (src && dst === src) identical += 1;
    if (looksLikeUzbekText(dst)) uzLooking += 1;
    if (cyrillicCharCount(dst) >= 8) cyrillicQs += 1;
  }

  const n = srcQs.length;
  if (empty > 0) return false;
  // 30%+ bir xil matn = tarjima amalda bo'lmagan
  if (identical > Math.max(1, Math.floor(n * 0.3))) return false;
  if (targetLang === 'ru') {
    if (cyrillicQs < Math.ceil(n * 0.6)) return false;
    if (uzLooking > Math.floor(n * 0.2)) return false;
  }
  if (targetLang === 'en' && uzLooking > Math.floor(n * 0.2)) return false;
  if (targetLang === 'uz' && cyrillicQs > Math.floor(n * 0.2)) return false;
  return true;
}

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
      `CRITICAL: Output MUST be entirely in ${outLang}. Do NOT leave any Uzbek/source-language sentences. ` +
      'Return ONLY valid JSON, no markdown fences.',
    user: JSON.stringify(source),
    maxTokens: 8192,
    temperature: 0.1,
    parse: (t) => parseJSONSafe(t),
  });

  if (!Array.isArray(translated.questions) || translated.questions.length !== content.questions.length) {
    throw new Error(`Translation to ${targetLang} returned incomplete questions`);
  }

  const questions: TestQuestion[] = content.questions.map((original, i) => {
    const t = translated.questions?.[i];
    const question = (t?.question || '').trim();
    const options = (t?.options || []).map((o) => (o || '').trim());
    const explanation = (t?.explanation || '').trim();
    if (!question || options.length !== original.options.length) {
      throw new Error(`Translation to ${targetLang} missing fields at question ${i + 1}`);
    }
    return {
      question,
      options,
      correctOptionIndex: original.correctOptionIndex,
      explanation,
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

  const result: TestSessionContent = {
    topic: (translated.topic || '').trim() || content.topic,
    questions,
    references: content.references,
  };
  if (!isTestTranslationAcceptable(content, result, targetLang)) {
    throw new Error(`Translation to ${targetLang} failed quality check (still source language)`);
  }
  return result;
}

async function translateTestSessionWithRetry(
  content: TestSessionContent,
  targetLang: AppLanguage,
): Promise<TestSessionContent> {
  try {
    return await translateTestSession(content, targetLang);
  } catch (err) {
    console.warn(`Test translation to ${targetLang} failed, retrying…`, err);
    return translateTestSession(content, targetLang);
  }
}

/** Test'ni asosiy tilda generatsiya qilgandan keyin qolgan 2 tilga parallel tarjima qiladi.
 * Har doim 3 til (primary + 2 tarjima) bo'lishiga urinadi. */
async function attachTestTranslations(session: TestSession, primaryLang: AppLanguage): Promise<TestSession> {
  const remaining = ALL_TEST_LANGUAGES.filter((l) => l !== primaryLang);
  const baseContent = toTestSessionContent(session);
  const results = await Promise.allSettled(
    remaining.map((lang) => translateTestSessionWithRetry(baseContent, lang)),
  );
  const translations: Partial<Record<AppLanguage, TestSessionContent>> = {};
  results.forEach((res, i) => {
    if (res.status === 'fulfilled') {
      translations[remaining[i]] = res.value;
    } else {
      console.warn(`Test translation to ${remaining[i]} failed:`, res.reason);
    }
  });
  return {
    ...session,
    primaryLanguage: primaryLang,
    ...(Object.keys(translations).length ? { translations } : {}),
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
  onProgress?: (rawTextSoFar: string) => void;
}): Promise<PresentationContent> {
  assertOpenAiApiKey();
  const outLang = languageName(params.language);
  const bookContext: BookContext | undefined = params.subjectCode
    ? { subjectCode: params.subjectCode, topicQuery: params.topicTitle }
    : undefined;
  const kind = params.topicType === 'practical' ? "amaliy mashg'ulot" : "ma'ruza";
  const fallbackTitle = `${params.topicId} — ${params.topicTitle}`;
  const enhanceBlock =
    params.mode === 'enhance'
      ? `O'qituvchi taqdimot yuklagan ("${params.sourceFileName || 'fayl'}"). Kontentni boyiting, lekin slide_type tuzilmasini saqlang. ` +
        (params.sourceText?.trim()
          ? `Manba matn:\n${params.sourceText.slice(0, 8000)}\n`
          : '')
      : "Noldan dars taqdimoti yarating.";

  const system =
    `${SYS_MEDICAL} Sen FAQAT kontent qaytarasan — dizayn, rang, font haqida hech narsa yozma. ` +
    'Akademik ohang: aniq, ilmiy, tibbiy ta\'lim (FJSTI) standartiga mos. ' +
    'Har slaydda MAX 5 bullet. HAR bullet MINIMUM 15, MAXIMUM 36 so\'z: ' +
    'faqat atama emas — nima ekanligi, qanday ishlashi yoki klinik ahamiyati tushuntirilsin. ' +
    'Qisqa 2–4 so\'zli tezislar TAQIQLANGAN. ' +
    '8–12 slayd; slide_type: title, agenda, content_bullets (2–3), statistics, ' +
    'comparison_table yoki process_flow, case_study, image_focus, summary — aralashtir, ketma-ket bir xil bo\'lmasin. ' +
    'content_bullets / image_focus / case_study / two_column uchun image_query MAJBURIY ' +
    '(inglizcha tibbiy anatomiya/diagramma kalit so\'zi, masalan "human skin layers epidermis dermis diagram"). ' +
    'summary bulletlari "Sarlavha: tushuntirish" formatida bo\'lsin. ' +
    `Til: ${outLang}. ` +
    (bookContext
      ? 'Darslik parchalariga tayan; o\'ylab topilgan manba yozma.'
      : "O'ylab topilgan manba/havola qo'shma.");

  const user =
    `Fan: ${params.subjectName}. Yo'nalish: ${params.variantLabel}. ` +
    `Mavzu ${params.topicId} (${kind}): ${params.topicTitle}.\n${enhanceBlock}\n` +
    'JSON: presentation_title, subject_area, author, slides[]. ' +
    'slides[].slide_type, title, subtitle, body{bullets,key_stat,stats,columns,comparison_rows,process_steps,quote_text,quote_author}, ' +
    'image_query, speaker_notes. Ishlatilmagan body maydonlari bo\'sh string/array.';

  params.onProgress?.('Kontent generatsiya…');

  const responseFormat = {
    type: 'json_schema',
    json_schema: PRESENTATION_JSON_SCHEMA,
  };

  let raw: Partial<PresentationContent> | null = null;
  try {
    raw = await openaiJson<Partial<PresentationContent>>({
      model: OPENAI_CHAT,
      system,
      user,
      maxTokens: 8000,
      temperature: 0.35,
      bookContext,
      responseFormat,
      parse: (t) => parseJSONSafe<Partial<PresentationContent>>(t),
    });
  } catch (err) {
    console.warn('Presentation json_schema failed, prompt fallback:', err);
    raw = await openaiJson<Partial<PresentationContent>>({
      model: OPENAI_CHAT,
      system: system + ' Return ONLY valid JSON matching the schema.',
      user,
      maxTokens: 8000,
      temperature: 0.3,
      bookContext,
      parse: (t) => parseJSONSafe<Partial<PresentationContent>>(t),
    });
  }

  params.onProgress?.('Kontent normalizatsiya…');
  let content = normalizePresentationContent(raw, {
    title: fallbackTitle,
    subject: params.subjectName,
    author: 'iMentor',
  });
  qaPresentationContent(content);
  params.onProgress?.('Rasmlar…');
  content = await resolvePresentationImages(content);
  return content;
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
      const avoid = await previousCaseAvoidBlock(topic);
      const keywordFocus = buildCaseKeywordsFocusPrompt(keywords);
      // RAG: kitob chunk'lari + PubMed/Semantic Scholar'dan REAL manbalar — bir marta
      // olinadi va 3 ta fokus (profilaktika/davolash/tashxis) uchun baravar ishlatiladi.
      const { sources: caseSources, contextText: caseContextText } = await fetchCaseContext(topic, subjectCode);

      // Har bir fokus MUSTAQIL urinadi — bittasi vaqtinchalik xato bersa ham
      // (tarmoq/JSON parse), qolgan ikkitasi qisqa/manbasiz eski rejimga
      // qaytarilmaydi (avval shunday edi: Promise.all bittasi rad etsa,
      // HAMMASI eski, manbasiz, qisqa promptga tushib qolardi — aynan shu
      // sabab foydalanuvchi qisqa/manbasiz javob ko'rgan edi). Endi shu
      // fokus alohida, o'sha boy/manbali prompt bilan yana bir marta uriniladi.
      const questions: CaseStudyQuestion[] = await Promise.all(
        CASE_STUDY_FOCUS_ORDER.map(async (focus) => {
          try {
            return await generateSingleCaseQuestion(
              topic,
              focus,
              language,
              keywordFocus,
              avoid,
              caseContextText,
              caseSources,
            );
          } catch (err) {
            console.warn(`Case focus "${focus}" birinchi urinishda muvaffaqiyatsiz, qayta urinilmoqda:`, err);
            return generateSingleCaseQuestion(
              topic,
              focus,
              language,
              keywordFocus,
              avoid,
              caseContextText,
              caseSources,
            );
          }
        }),
      );

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

  /**
   * Tez yo‘l: faqat asosiy tilda 1 ta AI so‘rov.
   * Tarjima + kitob manbalari — `enrichTestSession` (fonda, UI kutmaydi).
   */
  async generateTests(
    topic: string,
    count: number = 10,
    language: AppLanguage = 'uz',
    _subjectCode?: string,
  ): Promise<TestSession> {
    assertOpenAiApiKey();
    const safeCount = Math.min(30, Math.max(10, Math.round(count) || 10));
    const outLang = languageName(language);
    // Avoid-list ixtiyoriy — timeout bilan, generate’ni ushlab turmasin
    const avoid = await Promise.race([
      previousTestAvoidBlock(topic),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), 800)),
    ]);

    const generate = async (requestedCount: number): Promise<TestSession> => {
      const variety = buildTestVarietyPrompt(topic, requestedCount);
      // Tezlik: bookContext/RAG yo‘q (fon enrich’da); optionExplanations yo‘q (token).
      const parsed = await openaiJson({
        model: OPENAI_CHAT,
        system:
          `${SYS_MEDICAL} ${GENERATION_UNIQUENESS_RULE} ${requestedCount} ta test JSON: ` +
          `{topic, references:[], questions:[{question, options[5], correctOptionIndex, explanation, references:[]}]}. ` +
          'explanation — 1–2 qisqa gap (nega to\'g\'ri). optionExplanations YOZMANG. ' +
          'Manba/havola YOZMANG. ' +
          `Til: ${outLang}.`,
        user:
          `${variety}${avoid}\n\n${requestedCount} ta NOYOB savol. Klinik vignette 1–2 gap, 5 ta variant. ` +
          'explanation qisqa. Faqat valid JSON.',
        maxTokens: 6144,
        temperature: 0.45,
        parse: (t) => parseJSONSafe<TestSession>(t),
      });
      return normalizeTestSession(topic, parsed, requestedCount);
    };

    try {
      let data = await generate(safeCount);
      // Faqat juda buzilgan bo‘lsa qayta urin (kam savol) — weak sifat uchun ikkinchi to‘liq generate yo‘q
      if (!data.questions?.length || data.questions.length < Math.min(6, safeCount)) {
        data = await generate(Math.min(safeCount, 10));
      }
      return { ...normalizeTestSession(topic, data, safeCount), primaryLanguage: language };
    } catch (error) {
      console.warn('Test generation failed, compact retry…', error);
      const data = await generate(Math.min(safeCount, 10));
      return { ...normalizeTestSession(topic, data, safeCount), primaryLanguage: language };
    }
  },

  /** Tarjima (ru/en) + kitob manbalari — generate’dan KEYIN fonda. */
  async enrichTestSession(
    session: TestSession,
    language: AppLanguage = 'uz',
    subjectCode?: string,
  ): Promise<TestSession> {
    const primary = session.primaryLanguage || language;
    const [withRefs, translated] = await Promise.all([
      attachPerQuestionBookReferences(session, subjectCode),
      attachTestTranslations(session, primary),
    ]);
    const translations = translated.translations
      ? Object.fromEntries(
          Object.entries(translated.translations).map(([lang, content]) => [
            lang,
            {
              ...content,
              questions: content.questions.map((q, i) => ({
                ...q,
                ...(withRefs.questions[i]?.references?.length
                  ? { references: withRefs.questions[i].references }
                  : {}),
              })),
              ...(withRefs.references?.length ? { references: withRefs.references } : {}),
            },
          ]),
        )
      : undefined;

    return {
      ...withRefs,
      primaryLanguage: primary,
      ...(translations && Object.keys(translations).length
        ? { translations: translations as TestSession['translations'] }
        : {}),
    };
  },

  async generateLectureNotes(
    topic: string,
    description: string = '',
    language: AppLanguage = 'uz',
    subjectCode?: string,
    /** Matn generatsiya bo'lgan sari chaqiriladi — foydalanuvchi darhol
     * ko'rishi uchun (kutish tuyg'usini yo'qotadi, umumiy vaqt bir xil). */
    onProgress?: (textSoFar: string) => void,
  ): Promise<LectureNote> {
    try {
      assertOpenAiApiKey();
      const outLang = languageName(language);
      const bookContext: BookContext | undefined = subjectCode ? { subjectCode, topicQuery: topic } : undefined;
      const content = await openaiTextStream({
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
              '"(Manba: <HAQIQIY kitob nomi>, <HAQIQIY sahifa raqami>)" ko\'rsating — "<...>" ' +
              'belgilarini haqiqiy nom/raqam bilan almashtiring, "kitob nomi"/"sahifa-bet" so\'zlarini ' +
              'o\'zgarishsiz qoldirmang; aniq bilmasangiz manba qatorini butunlay tashlab keting.'
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
        onDelta: onProgress ?? (() => {}),
      });

      return {
        topic: topic,
        content: stripPlaceholderManba(content || '')
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
    onProgress?: (rawTextSoFar: string) => void;
  }): Promise<PresentationContent> {
    return requestPresentationDeckFromAi(params);
  },

  async generateImage(_prompt: string): Promise<string | null> {
    // Maxfiylik: tashqi rasm generatsiya servislari o‘chirilgan (pollinations.ai).
    return null;
  },
};
