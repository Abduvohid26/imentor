import { type AppLanguage, inferPdfLanguage } from '../i18n/language';
import { translate } from '../i18n/translations';
import type { PresentationDeck, PresentationSlideLayout } from '../utils/buildPresentationPptx';
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
  openaiJsonStream,
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
import { listPreparedForTopic, loadPreparedById } from '../utils/preparedContentStore';
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

/** Wikimedia Commons'dan ochiq litsenziyali (CC) rasm izlaydi — API kalit
 * kerak emas, CORS `origin=*` bilan ochiq. Taqdimot slaydlariga real
 * rasm biriktirish uchun ishlatiladi (AI o'ylab topgan emas — haqiqiy
 * ochiq manbadan). */
/** Sarlavha/tavsifda tibbiyotga aloqasi yo'qligini ko'rsatuvchi so'zlar —
 * fotograf/rassom portretlari, san'at asarlari va h.k. tasodifan mos
 * kelib qolishining oldini olish uchun (masalan mavzu bilan bog'liq
 * bo'lmagan mashhur fotograf nomlari). */
const IRRELEVANT_IMAGE_HINTS =
  /portrait|photographer|painting|artwork|album cover|logo|flag of|coat of arms|stamp|banknote|coin\b/i;

async function searchOpenImage(query: string): Promise<{ url: string; credit: string } | null> {
  const q = query.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!q) return null;
  try {
    const searchUrl =
      'https://commons.wikimedia.org/w/api.php?action=query&generator=search' +
      `&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=8` +
      '&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=900&format=json&origin=*';
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(9000) });
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
    const pages = Object.values(data.query?.pages || {});
    for (const page of pages) {
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
      const credit = artist ? `${artist} · ${license} (Wikimedia Commons)` : `${license} (Wikimedia Commons)`;
      return { url: imgUrl, credit };
    }
    return null;
  } catch {
    return null;
  }
}

/** Bir nechta slayd uchun parallel ravishda ochiq manba rasm topib
 * biriktiradi. Topilmasa slayd matnli holicha qoladi (xato bermaydi). */
/** Wikimedia Commons asosan INGLIZCHA tavsif/nomlarga ega — o'zbek/rus
 * tilidagi sarlavha bilan qidirilsa deyarli hech narsa topilmaydi. Shu
 * sabab slayd sarlavhalarini bitta AI so'rov bilan qisqa inglizcha qidiruv
 * so'zlariga o'tkazamiz (har slayd uchun alohida so'rov emas — tez va
 * arzon). Muvaffaqiyatsiz bo'lsa, xom sarlavhalar bilan davom etiladi. */
async function translateTitlesForImageSearch(
  titles: string[],
  subjectName: string,
): Promise<string[]> {
  if (!titles.length) return titles;
  try {
    const result = await openaiJson<{ queries?: string[] }>({
      model: OPENAI_FAST,
      system:
        'For each numbered medical topic title, output a short (2-5 word) ENGLISH search ' +
        'query for Wikimedia Commons that will find a RELEVANT clinical/anatomical image — ' +
        'a specific medical term (organ, disease, pathology, procedure, anatomy diagram) using ' +
        'standard English medical terminology. NEVER output a generic word alone, a person\'s ' +
        'name, or a non-medical term — always ground it in the medical subject. Return ONLY ' +
        'JSON: {"queries":["...", ...]} — SAME COUNT and SAME ORDER as input, no commentary.',
      user: `Subject: ${subjectName}\nTitles:\n${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`,
      maxTokens: 800,
      temperature: 0.2,
      parse: (t) => parseJSONSafe<{ queries?: string[] }>(t),
    });
    if (Array.isArray(result.queries) && result.queries.length === titles.length) {
      return result.queries.map((q, i) => (q?.trim() ? q.trim() : titles[i]));
    }
  } catch {
    /* xom sarlavhalar bilan davom etamiz */
  }
  return titles;
}

async function attachOpenImagesToDeck(
  deck: PresentationDeck,
  subjectName: string,
): Promise<PresentationDeck> {
  const contentIdx = deck.slides
    .map((_, idx) => idx)
    .filter((idx) => idx !== 0 && idx !== deck.slides.length - 1);
  const rawTitles = contentIdx.map((idx) => deck.slides[idx].title);
  const searchQueries = await translateTitlesForImageSearch(rawTitles, subjectName).catch(() => rawTitles);
  const queryByIdx = new Map(contentIdx.map((idx, i) => [idx, searchQueries[i] || rawTitles[i]]));

  const slides = await Promise.all(
    deck.slides.map(async (slide, idx) => {
      const query = queryByIdx.get(idx);
      if (!query) return slide;
      // Subject + query — Commons topish ehtimolini oshiradi
      const q = `${subjectName} ${query}`.replace(/\s+/g, ' ').trim().slice(0, 120);
      const found =
        (await searchOpenImage(q).catch(() => null)) ||
        (await searchOpenImage(query).catch(() => null));
      if (!found) return slide;
      const dataUrl = await fetchImageAsDataUrl(found.url).catch(() => null);
      if (!dataUrl) return slide;
      const nextLayout: PresentationSlideLayout =
        slide.layout === 'process' || slide.layout === 'checklist' ? slide.layout : 'split';
      return {
        ...slide,
        imageUrl: dataUrl,
        imageCredit: found.credit,
        // Rasm topilsa — split (matn + vizual panel) majburiy
        layout: nextLayout,
      };
    }),
  );
  return { ...deck, slides };
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
    // explanation endi batafsil (8–12 gap) — juda qisqa izoh zaif hisoblanadi
    return qLen < 120 || expLen < 280 || badOptions;
  });
  return badQuestions.length > Math.max(1, Math.floor(data.questions.length * 0.35));
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
        body: JSON.stringify({
          subject_code: code,
          queries: questions.map((q) => q.question || ''),
          top_k: 3,
        }),
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
const PRESENTATION_MIN_BULLETS = 7;
const PRESENTATION_MAX_BULLETS = 10;

function fallbackPresentationSlides(fallbackTitle: string): PresentationDeck['slides'] {
  return [
    {
      title: 'Kirish',
      layout: 'agenda',
      bullets: [
        `Mavzu: ${fallbackTitle} — dars maqsadi va ahamiyati`,
        'Asosiy tushunchalar: ta\'riflar va tasnif',
        'Etiologiya: sabab omillari va xavf guruhlari',
        'Patogenez: jarayon bosqichlari',
        'Klinik ko\'rinish va diagnostika: belgi va tekshiruvlar',
        'Davolash va xulosa: amaliy yo\'nalish',
      ],
      notes: 'Kirishda faqat reja. Har tema keyingi slaydlarda chuqur ochiladi.',
    },
    {
      title: 'Asosiy tushunchalar',
      layout: 'cards',
      bullets: [
        'Markaziy atamalar: nima ekanligi, qayerda uchrashi va klinik ahamiyati.',
        'Tasniflash: asosiy turlari, farqlovchi belgilar va guruhlar.',
        'Normal vs patologik: ogohlantiruvchi belgilar va chuqurroq tekshiruv.',
        'Klinik misol: shikoyat, topilma va birinchi qadam.',
        'Eslab qolish: ta\'rif + tasnif + klinik signal.',
      ],
      notes: 'Har bir ta\'rifni misol bilan bog\'lang.',
    },
    {
      title: 'Etiologiya',
      layout: 'cards',
      bullets: [
        'Ichki omillar: yosh, jins, genetik moyillik va surunkali kasalliklar.',
        'Tashqi omillar: kasbiy ta\'sir, infeksiya, hayot tarzi.',
        'Triggerlar: qachon jarayon faollashadi va qanday namoyon bo\'ladi.',
        'Profilaktika: birlamchi choralar va bemorga tavsiyalar.',
        'Klinik ahamiyat: sababni bilish davolashni qanday o\'zgartiradi.',
      ],
    },
    {
      title: 'Patogenez / mexanizm',
      layout: 'process',
      bullets: [
        'Boshlang\'ich omil: jarayonni ishga tushiruvchi asosiy sabab.',
        'Zanjir reaksiya: tizimlar o\'zaro ta\'siri va kuchayishi.',
        'Kompensatsiya: organizm moslashuvi va uning chegarasi.',
        'Asoratlar yo\'li: kechikkan holatda og\'irlashish.',
        'Amaliy xulosa: davolash nuqtalari mexanizmdan kelib chiqadi.',
      ],
    },
    {
      title: 'Klinik ko\'rinish',
      layout: 'cards',
      bullets: [
        'Asosiy simptomlar: shikoyat, muddat, kuchaytiruvchi omillar.',
        'Obyektiv belgilar: ko\'rik topilmalari va yuqori xavf signallari.',
        'Og\'irlik: engil / o\'rtacha / og\'ir mezonlari.',
        'Differensial: o\'xshash holatlardan ajratish.',
        'Urgentsiya: qachon shoshilinch yo\'naltirish kerak.',
      ],
    },
    {
      title: 'Diagnostika',
      layout: 'process',
      bullets: [
        'Anamnez va ko\'rik: majburiy savollar va yo\'nalish beruvchi topilmalar.',
        'Laboratoriya: asosiy ko\'rsatkichlar va talqin.',
        'Instrumental: qachon qaysi usul tanlanadi.',
        'Tasdiqlash: minimal majburiy mezonlar to\'plami.',
        'Xatoliklar: kechikkan tashxis va ortiqcha tekshiruvdan qochish.',
      ],
    },
    {
      title: 'Davolash tamoyillari',
      layout: 'cards',
      bullets: [
        'Konservativ: qachon dastlabki choralar yetarli.',
        'Asosiy terapiya: tanlash mezonlari va monitoring.',
        'Invaziv variantlar: ko\'rsatma va qarshi ko\'rsatmalar.',
        'Qo\'llab-quvvatlash: og\'riq, infeksiya, reabilitatsiya.',
        'Xavfsizlik: asorat belgilarini bemorga tushuntirish.',
      ],
    },
    {
      title: 'Profilaktika va kuzatuv',
      layout: 'checklist',
      bullets: [
        'Birlamchi profilaktika: xavf omillarini kamaytirish.',
        'Skrining: erta aniqlash va yuqori xavf guruhlari.',
        'Kuzatuv rejasi: qayta tashrif va qayta baholash.',
        'Hayot tarzi: ovqatlanish, faollik, zararli odatlar.',
        'Xulosa: profilaktika davolashdan kam ahamiyatli emas.',
      ],
    },
    {
      title: 'Klinik misol',
      layout: 'process',
      bullets: [
        'Holat: yosh, shikoyat va muhim anamnez.',
        'Savollar: qo\'shimcha ma\'lumot nima so\'raladi.',
        'Topilmalar: ko\'rik va birinchi tekshiruvlar.',
        'Qaror: differensial → ehtimolli tashxis → chora.',
        'Muhokama: guruh javobi va o\'qituvchi xulosasi.',
      ],
    },
    {
      title: 'Xulosa',
      layout: 'cards',
      bullets: [
        'Asosiy zanjir: tushuncha → sabab → mexanizm → belgi.',
        'Eslab qolish: erta aniqlash va to\'g\'ri diagnostika.',
        'Amaliy ahamiyat: bemor xavfsizligi va individual yondashuv.',
        'Keyingi qadam: amaliy mashg\'ulot yoki chuqurroq mavzu.',
        'Savol-javob: 2–3 ta tekshiruv savoli bilan yakun.',
      ],
    },
  ];
}

const PRESENTATION_LAYOUTS = new Set<PresentationSlideLayout>([
  'agenda',
  'cards',
  'process',
  'split',
  'checklist',
  'bullets',
]);

function normalizeLayout(raw: unknown, index: number): PresentationSlideLayout | undefined {
  const v = String(raw || '').trim().toLowerCase() as PresentationSlideLayout;
  if (PRESENTATION_LAYOUTS.has(v)) return v;
  if (index === 0) return 'agenda';
  return undefined;
}

function normalizePresentationDeck(
  raw: Partial<PresentationDeck> | null | undefined,
  fallbackTitle: string,
): PresentationDeck {
  const title = (raw?.title || fallbackTitle || 'Taqdimot').trim().slice(0, 120);
  const slides = (Array.isArray(raw?.slides) ? raw!.slides! : [])
    .map((s, i) => {
      const st = String(s?.title || `Slayd ${i + 1}`).trim();
      const isIntro = i === 0 || /^kirish|reja|outline|introduction/i.test(st);
      const layout = normalizeLayout((s as { layout?: unknown }).layout, i);
      const minLen = isIntro || layout === 'agenda' || layout === 'process' || layout === 'cards' ? 18 : 40;
      const bullets = (Array.isArray(s?.bullets) ? s.bullets : [])
        .map((b) => String(b || '').trim())
        .filter((b) => b.length >= minLen)
        .slice(0, PRESENTATION_MAX_BULLETS);
      let notes = String(s?.notes || '').trim();
      if (!st || bullets.length < 3) return null;

      // Faqat oddiy bullets layoutida notes ni matnga qo'shamiz —
      // kartochka/process uchun notes faqat manba uchun qoladi.
      const mergeNotes = !layout || layout === 'bullets';
      if (mergeNotes && notes) {
        for (const part of notes.split(/(?<=[.!?])\s+/)) {
          if (bullets.length >= PRESENTATION_MAX_BULLETS) break;
          const p = part.trim();
          if (p.length < (isIntro ? 25 : 50)) continue;
          if (/^\(?manba:/i.test(p)) continue;
          if (bullets.some((b) => b.includes(p.slice(0, 36)) || p.includes(b.slice(0, 36)))) continue;
          bullets.push(p.slice(0, 420));
        }
      }

      const manba =
        notes.match(/\(Manba:\s*[^)]+\)/i)?.[0] ||
        notes.match(/Manba:\s*[^\n.]+/i)?.[0] ||
        '';
      const notesKeep = manba
        ? manba.startsWith('(')
          ? manba
          : `(${manba})`
        : notes && !mergeNotes
          ? notes.slice(0, 800)
          : undefined;

      return {
        title: st.slice(0, 120),
        bullets: bullets.slice(0, PRESENTATION_MAX_BULLETS),
        notes: notesKeep,
        layout: layout || (isIntro ? 'agenda' : undefined),
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
      layout: 'cards',
      bullets: [
        `Nazariy asos: ${fallbackTitle} bo'yicha asosiy tushunchalar va klinik mezonlar.`,
        'Tasnif va farq: normal vs patologik holat, farqlovchi belgilar.',
        'Diagnostika: anamnez, tekshiruvlar va tasdiqlash ketma-ketligi.',
        'Davolash: birinchi qadam, monitoring va xavf signallari.',
        'Amaliy xulosa: shikoyat → topilma → qaror → kuzatuv.',
      ],
      notes: undefined,
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
  /** Generatsiya davom etayotganda xom matn bilan chaqiriladi (birinchi
   * urinishda) — foydalanuvchi jarayonni jonli kuzatishi uchun. */
  onProgress?: (rawTextSoFar: string) => void;
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
        `Mavjud materialni SAQLAB, har slaydni TO'LIQ MATN bilan boyiting (qisqartirmang). ` +
        (params.sourceText?.trim()
          ? `Yuklangan fayldan ajratilgan matn:\n${params.sourceText.slice(0, 12000)}\n`
          : '')
      : 'O\'qituvchida taqdimot yo\'q — mavzu bo\'yicha noldan dars taqdimoti yarating.';

  const userPrompt =
    `Fan: ${params.subjectName}. Yo'nalish: ${params.variantLabel}. ` +
    `Mavzu ${params.topicId} (${kind}): ${params.topicTitle}.\n${enhanceBlock}\n\n` +
    'MAJBURIY USLUB — infografika taqdimot (AiShifokor/kafedra PPTX namunasi):\n' +
    '1) 1-slayd: layout="agenda" — dars REJASI. Har bullet: "Tema nomi: 1 qator izoh".\n' +
    '2) Keyingi slaydlar — layout ni mazmunga mos tanlang:\n' +
    '   - "cards" — 4–6 ta kalit tezis (tavsiya etiladi)\n' +
    '   - "process" — bosqichma-bosqich jarayon/sxema (3–5 qadam)\n' +
    '   - "checklist" — mezon/ko\'rsatma/qarshi ko\'rsatma ro\'yxati\n' +
    '   - "bullets" — faqat juda zich matn kerak bo\'lganda\n' +
    '3) HAR bullet formati: "Qisqa sarlavha: 1–2 to\'liq gaplik izoh" ' +
    '(infografika kartochkasiga mos). Oddiy 1 so\'zlik yorliq YAROQSIZ.\n' +
    `4) Har kontent-slaydda ${PRESENTATION_MIN_BULLETS}-8 ta bullet.\n` +
    '5) notes: qo\'shimcha o\'qituvchi izohi + oxirida (Manba: kitob, sahifa) agar kitob berilgan bo\'lsa.\n' +
    '6) Oxirgi slayd "Xulosa" — layout="cards" yoki "checklist".';

  const attempts: Array<{ maxTokens: number; temperature: number }> = [
    { maxTokens: 16000, temperature: 0.35 },
    { maxTokens: 14000, temperature: 0.28 },
  ];

  for (const [attemptIdx, attempt] of attempts.entries()) {
    try {
      const requestFn = attemptIdx === 0 ? openaiJsonStream : openaiJson;
      const raw = await requestFn<Partial<PresentationDeck>>({
        model: OPENAI_CHAT,
        system:
          `${SYS_MEDICAL} Return ONLY valid JSON: ` +
          '{"title":"...","slides":[{"title":"...","layout":"agenda|cards|process|checklist|bullets",' +
          '"bullets":["Sarlavha: izoh..."],"notes":"..."}]} . ' +
          `KAMIDA ${PRESENTATION_MIN_SLIDES} slayd. ` +
          'CRITICAL: design for INFOGRAPHIC slides (numbered cards / process / checklist), ' +
          'NOT a wall of plain paragraphs. Each bullet MUST be "Short title: 1-2 sentences". ' +
          'Language: ' +
          outLang + '. ' +
          (bookContext
            ? 'Faqat berilgan darslik parchalariga tayaning; notes oxirida ' +
              '"(Manba: <HAQIQIY kitob nomi>, <HAQIQIY sahifa>)" — aniq bilmasangiz manbani tashlang. ' +
              'Tashqi DOI/PubMed qo\'shmang.'
            : 'Tashqi havola / o\'ylab topilgan manba qo\'shmang.'),
        user: userPrompt,
        maxTokens: attempt.maxTokens,
        temperature: attempt.temperature,
        parse: (t) => parseJSONSafe<Partial<PresentationDeck>>(t),
        bookContext,
        ...(attemptIdx === 0 ? { onProgress: params.onProgress } : {}),
      });
      const rawCount = Array.isArray(raw?.slides) ? raw.slides.length : 0;
      if (rawCount > 0 && rawCount < 6) {
        console.warn('Presentation AI returned too few slides, retrying…', rawCount);
        continue;
      }
      const deck = normalizePresentationDeck(raw, fallbackTitle);
      return await attachOpenImagesToDeck(deck, params.subjectName);
    } catch (error) {
      console.warn('Presentation AI attempt failed:', error);
    }
  }

  return attachOpenImagesToDeck(
    normalizePresentationDeck(null, fallbackTitle),
    params.subjectName,
  ).catch(() => normalizePresentationDeck(null, fallbackTitle));
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
      let bookRefs: MedicalReference[] = [];
      const parsed = await openaiJson({
        model: OPENAI_CHAT,
        system: `${SYS_MEDICAL} ${GENERATION_UNIQUENESS_RULE} ${requestedCount} ta test JSON: {topic, references:[], questions:[{question, options[5], correctOptionIndex, explanation, optionExplanations[5], references:[]}]}. explanation — BATAFSIL (8–12 to'liq gap yoki ~600–1200 belgi): klinik asos, nega to'g'ri javob, boshqa yondashuvlar nega mos emas; FAQAT berilgan darslik kontekstidagi faktlar (yo'q narsani uydirma). optionExplanations — options bilan bir xil tartibda, HAR variant uchun 2–3 to'liq gap: to'g'ri uchun nega to'g'ri, xato uchun aynan shu variant nega noto'g'ri. Manba/havola YOZMANG — foydalanilgan darslik va sahifalarni tizim o'zi biriktiradi. Til: ${outLang}. ${jsonReferencesRule(Boolean(bookContext))}`,
        user: `${variety}${avoid}\n\n${requestedCount} ta NOYOB savol. Klinik vignette 3-6 gap, 5 ta teng variant, kuchli distraktorlar. explanation ${shortMode ? '6–8' : '8–12'} to'liq gap (qisqa 1–2 gap QABUL QILINMAYDI), hech qanday havola/manba raqami qo'shmasdan; faktlardan chetga chiqma. optionExplanations: har bir variant uchun 2–3 gapli aniq sabab (manba/havola yozmasdan). ${strict ? 'Faqat valid JSON.' : ''}`,
        maxTokens: 12288,
        temperature: strict ? 0.42 : 0.68,
        parse: (t) => parseJSONSafe<TestSession>(t),
        bookContext,
        onBookReferences: (refs) => {
          bookRefs = refs;
        },
      });
      return normalizeTestSession(topic, parsed, requestedCount, bookRefs);
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

    return attachPerQuestionBookReferences(base, subjectCode).then((withRefs) =>
      attachTestTranslations(withRefs, language),
    );
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
  }): Promise<PresentationDeck> {
    return requestPresentationDeckFromAi(params);
  },

  async generateImage(_prompt: string): Promise<string | null> {
    // Maxfiylik: tashqi rasm generatsiya servislari o‘chirilgan (pollinations.ai).
    return null;
  },
};
