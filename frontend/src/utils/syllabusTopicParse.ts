import type { SyllabusTopic } from '../services/aiService';

export type TopicSection = 'lecture' | 'practical' | 'unknown';

const LECTURE_PREFIXES = ['M', 'L', 'Л'];
const PRACTICAL_PREFIXES = ['A', 'P', 'П'];

const LECTURE_SECTION_RE =
  /^(?:ma'?ruza(?:lar)?|maruza|lecture(?:s)?|лекци[яиюеё]?|теоретическ|theor)/iu;
const PRACTICAL_SECTION_RE =
  /^(?:amaliy(?:\s+mashg'?ulot)?|practical(?:s)?|практик[аиеё]?|лаборатор)/iu;

const UNIVERSITY_NOISE_RE =
  /(?:universitet|institut|akademiy|vazirlik|ministry|республик|o[''`]zbekiston|uzbekistan|fakultet|kafedra|department|syllabus|учебн(?:ая|ый)\s+программ)/iu;

const ACADEMIC_YEAR_RE = /^\d{4}\s*[-–/]\s*\d{2,4}$/;

export function detectTopicSection(line: string): TopicSection {
  const trimmed = line.trim();
  if (!trimmed) return 'unknown';
  if (LECTURE_SECTION_RE.test(trimmed)) return 'lecture';
  if (PRACTICAL_SECTION_RE.test(trimmed)) return 'practical';
  return 'unknown';
}

export function inferTopicTypeFromId(id: string): 'lecture' | 'practical' {
  const first = (id[0] || '').toUpperCase();
  if (LECTURE_PREFIXES.includes(first)) return 'lecture';
  if (PRACTICAL_PREFIXES.includes(first)) return 'practical';
  return 'lecture';
}

/** Har qanday ID formatini M1/L1/A1/P1 ko'rinishiga keltirish */
export function coerceTopicId(
  rawId: string,
  type: 'lecture' | 'practical',
  fallbackIndex: number,
): string {
  const compact = String(rawId || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

  const standard = compact.match(/^([MALPЛП])(\d{1,2})$/u);
  if (standard) {
    const letter = standard[1].toUpperCase();
    const num = standard[2];
    if (LECTURE_PREFIXES.includes(letter) || PRACTICAL_PREFIXES.includes(letter)) {
      return `${letter}${num}`;
    }
  }

  const labeled = compact.match(
    /^(?:MARUZA|MA'?RUZA|LECTURE|LEKTSIYA|LEKTS|ЛЕКЦИЯ|ЛЕК)(?:№|#)?(\d{1,2})$/u,
  );
  if (labeled) return `L${labeled[1]}`;

  const practicalLabeled = compact.match(
    /^(?:AMALIY|PRACTICAL|PRAKTIK|ПРАКТИК|ПРАК)(?:№|#)?(\d{1,2})$/u,
  );
  if (practicalLabeled) return `A${practicalLabeled[1]}`;

  const numOnly = compact.match(/^(\d{1,2})$/);
  const num = numOnly ? numOnly[1] : String(fallbackIndex);
  const prefix = type === 'practical' ? 'A' : 'L';
  return `${prefix}${num}`;
}

export function normalizeSyllabusTopics(input: SyllabusTopic[]): SyllabusTopic[] {
  const topics = input
    .filter((t) => t && typeof t.title === 'string')
    .map((t, index) => {
      const title = t.title.trim();
      const inferredType: 'lecture' | 'practical' =
        t.type === 'practical' || t.type === 'lecture'
          ? t.type
          : inferTopicTypeFromId(String(t.id || ''));
      const id = coerceTopicId(String(t.id || ''), inferredType, index + 1);
      return { id, title, type: inferTopicTypeFromId(id) } as SyllabusTopic;
    })
    .filter((t) => t.title.length > 2);

  const dedup = new Map<string, SyllabusTopic>();
  for (const t of topics) {
    const existing = dedup.get(t.id);
    if (!existing || t.title.length > existing.title.length) {
      dedup.set(t.id, t);
    }
  }

  const parseOrder = (id: string): [number, number] => {
    const prefix = id[0] || '';
    const num = Number((id.match(/\d+/) || ['0'])[0]);
    const group = LECTURE_PREFIXES.includes(prefix) ? 0 : 1;
    return [group, Number.isFinite(num) ? num : 0];
  };

  return Array.from(dedup.values()).sort((a, b) => {
    const [ga, na] = parseOrder(a.id);
    const [gb, nb] = parseOrder(b.id);
    if (ga !== gb) return ga - gb;
    if (na !== nb) return na - nb;
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });
}

export function scoreSyllabusTopics(topics: SyllabusTopic[]): number {
  if (!topics.length) return 0;
  let score = topics.length * 12;
  const avgTitle =
    topics.reduce((sum, t) => sum + t.title.length, 0) / Math.max(topics.length, 1);
  if (avgTitle > 12) score += 15;
  if (avgTitle > 25) score += 10;
  const ids = new Set(topics.map((t) => t.id));
  if (ids.size === topics.length) score += 20;
  return score;
}

export function isWeakSyllabusExtraction(topics: SyllabusTopic[]): boolean {
  return topics.length < 2 || scoreSyllabusTopics(topics) < 30;
}

function parseTopicFromLine(
  line: string,
  section: TopicSection,
  lectureCounter: { n: number },
  practicalCounter: { n: number },
): SyllabusTopic | null {
  const trimmed = line.trim();
  if (trimmed.length < 4) return null;

  const standard = trimmed.match(
    /\b([MALPЛП])\s*[-.):]?\s*(\d{1,2})\b[\s:.)–\-]*(.+)$/iu,
  );
  if (standard) {
    const prefix = standard[1].toUpperCase();
    const id = `${prefix}${standard[2]}`;
    const title = standard[3].trim();
    if (title.length < 3) return null;
    return {
      id,
      title,
      type: inferTopicTypeFromId(id),
    };
  }

  const lectureLine = trimmed.match(
    /^(?:ma'?ruza|maruza|lecture|лекци[яиюеё]?)\s*[#№.]?\s*(\d{1,2})[\s:.)–\-]+(.+)$/iu,
  );
  if (lectureLine) {
    return {
      id: `L${lectureLine[1]}`,
      title: lectureLine[2].trim(),
      type: 'lecture',
    };
  }

  const practicalLine = trimmed.match(
    /^(?:amaliy|practical|практик[аиеё]?|лаборатор(?:ная)?)\s*[#№.]?\s*(\d{1,2})[\s:.)–\-]+(.+)$/iu,
  );
  if (practicalLine) {
    return {
      id: `A${practicalLine[1]}`,
      title: practicalLine[2].trim(),
      type: 'practical',
    };
  }

  const numbered = trimmed.match(/^(\d{1,2})[\s.)–\-]+(.{4,})$/);
  if (numbered && section !== 'unknown') {
    const type = section === 'practical' ? 'practical' : 'lecture';
    const counter = type === 'practical' ? practicalCounter : lectureCounter;
    counter.n += 1;
    const id = coerceTopicId(numbered[1], type, counter.n);
    return {
      id,
      title: numbered[2].trim(),
      type,
    };
  }

  return null;
}

export function extractTopicsByRegex(text: string): SyllabusTopic[] {
  const result: SyllabusTopic[] = [];
  let section: TopicSection = 'unknown';
  const lectureCounter = { n: 0 };
  const practicalCounter = { n: 0 };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const sectionHint = detectTopicSection(line);
    if (sectionHint !== 'unknown') {
      section = sectionHint;
      continue;
    }

    const topic = parseTopicFromLine(line, section, lectureCounter, practicalCounter);
    if (topic) result.push(topic);
  }

  return normalizeSyllabusTopics(result);
}

export function guessSubjectFromDocumentText(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 80);

  const labelPatterns = [
    /^(?:fan(?:\s+nomi)?|fani|kurs(?:\s+nomi)?|predmet|subject|course|дисциплина|название\s+предмета|наименование\s+дисциплины)[:\s.\-–]+(.+)$/iu,
    /^syllabus[:\s.\-–]+(.+)$/iu,
    /^учебная\s+программа[:\s.\-–]+(.+)$/iu,
    /^(?:discipline|module)[:\s.\-–]+(.+)$/iu,
  ];

  for (const line of lines) {
    for (const pattern of labelPatterns) {
      const match = line.match(pattern);
      const candidate = match?.[1]?.trim();
      if (isPlausibleSubjectName(candidate)) return candidate!;
    }
  }

  for (const line of lines) {
    if (!isPlausibleSubjectName(line)) continue;
    if (/^([MALPЛП])\s*[-.):]?\s*\d+/iu.test(line)) continue;
    if (LECTURE_SECTION_RE.test(line) || PRACTICAL_SECTION_RE.test(line)) continue;
    return line;
  }

  return '';
}

function isPlausibleSubjectName(value?: string): boolean {
  if (!value) return false;
  const candidate = value.trim();
  if (candidate.length < 4 || candidate.length > 160) return false;
  if (UNIVERSITY_NOISE_RE.test(candidate)) return false;
  if (ACADEMIC_YEAR_RE.test(candidate)) return false;
  if (/^\d+$/.test(candidate)) return false;
  return true;
}

export function countTopicsByType(topics: SyllabusTopic[]): {
  lectures: number;
  practicals: number;
} {
  return {
    lectures: topics.filter((t) => t.type === 'lecture').length,
    practicals: topics.filter((t) => t.type === 'practical').length,
  };
}
