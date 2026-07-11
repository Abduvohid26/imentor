import type { SyllabusTopic } from '../services/aiService';
import type { AppLanguage } from '../i18n/language';

/** Fan + yo'nalish + mavzu — barcha modullar uchun barqaror kalit */
export interface SyllabusTopicContext extends SyllabusTopic {
  syllabusId: number;
  subjectName: string;
  subjectCode: string;
  variantLabel: string;
  /** Fan o'qitilish tili — platforma va AI shu tilga o'tadi */
  instructionLanguage: AppLanguage;
}

const SELECTED_TOPIC_KEY = 'imentor-selected-topic-v2';
const VARIANT_BY_SUBJECT_KEY = 'imentor-syllabus-variant-v1';

export function buildTopicContext(
  topic: SyllabusTopic,
  syllabusId: number,
  subjectName: string,
  subjectCode: string,
  variantLabel: string,
  instructionLanguage: AppLanguage,
): SyllabusTopicContext {
  return {
    ...topic,
    syllabusId,
    subjectName,
    subjectCode,
    variantLabel,
    instructionLanguage,
  };
}

function normTopicSegment(value: string, max: number): string {
  return value.trim().toLowerCase().slice(0, max);
}

/** Handout/presentation/lecture uchun qisqa barqaror kalit — faqat M1/A2 kodi (sarlavha emas) */
export function topicNormForStorage(
  ctx: Pick<SyllabusTopicContext, 'syllabusId' | 'variantLabel' | 'id'>,
): string {
  const variant = normTopicSegment(ctx.variantLabel, 48);
  const topicCode = normTopicSegment(ctx.id.replace(/\s+/g, ''), 16);
  if (!topicCode) {
    throw new Error('Mavzu kodi (M1, L2, …) topilmadi.');
  }
  return `${ctx.syllabusId}::${variant}::${topicCode}`;
}

/** Eski yozuvlar — to'liq mavzu sarlavhasi bilan */
export function topicNormLegacyTitleKey(
  ctx: Pick<SyllabusTopicContext, 'syllabusId' | 'variantLabel' | 'title'>,
): string {
  const variant = normTopicSegment(ctx.variantLabel, 48);
  const title = normTopicSegment(ctx.title, 160);
  return `${ctx.syllabusId}::${variant}::${title}`;
}

/** API so'rovida faqat shu mavzuga tegishli kalitlar (umumiy sarlavha kaliti yo'q) */
export function topicNormLookupKeys(topic: SyllabusTopic | SyllabusTopicContext | string): string[] {
  if (typeof topic === 'string') {
    const k = topic.trim().toLowerCase();
    return k ? [k] : [];
  }
  if (!topic?.title) return [];
  if (!isTopicContextComplete(topic)) {
    return [topicNormLegacy(topic.title)];
  }
  const ctx = topic;
  const keys = new Set<string>();
  try {
    keys.add(topicNormForStorage(ctx));
  } catch {
    /* id yo'q */
  }
  keys.add(topicNormLegacyTitleKey(ctx));
  keys.add(
    `${ctx.syllabusId}::${ctx.variantLabel.trim().toLowerCase()}::${ctx.title.trim().toLowerCase()}`,
  );
  return [...keys].filter(Boolean);
}

export function handoutMatchesTopic(
  row: { topic_norm: string },
  topic: SyllabusTopic | SyllabusTopicContext | string,
): boolean {
  const allowed = new Set(topicNormLookupKeys(topic).map((k) => k.toLowerCase()));
  return allowed.has((row.topic_norm || '').trim().toLowerCase());
}

/** Eski mavzular bilan moslik — kontekstsiz title */
export function topicNormLegacy(title: string): string {
  return title.trim().toLowerCase();
}

export function resolveTopicNorm(topic: SyllabusTopic | SyllabusTopicContext | null): string {
  if (!topic?.title) return '';
  if (isTopicContextComplete(topic)) {
    return topicNormForStorage(topic);
  }
  return topicNormLegacy(topic.title);
}

export function isTopicContextComplete(
  topic: SyllabusTopic | SyllabusTopicContext | null,
): topic is SyllabusTopicContext {
  return Boolean(
    topic &&
      topic.id?.trim() &&
      'syllabusId' in topic &&
      topic.syllabusId != null &&
      topic.subjectName &&
      topic.variantLabel,
  );
}

export function topicsMatch(
  a: SyllabusTopic | SyllabusTopicContext | null,
  b: SyllabusTopic | SyllabusTopicContext | null,
): boolean {
  if (!a || !b) return false;
  if (isTopicContextComplete(a) && isTopicContextComplete(b)) {
    return (
      a.syllabusId === b.syllabusId &&
      a.variantLabel === b.variantLabel &&
      a.id === b.id &&
      a.type === b.type
    );
  }
  return a.id === b.id && a.title === b.title && a.type === b.type;
}

export function persistSelectedTopic(topic: SyllabusTopicContext | null): void {
  try {
    if (!topic) {
      localStorage.removeItem(SELECTED_TOPIC_KEY);
      return;
    }
    localStorage.setItem(SELECTED_TOPIC_KEY, JSON.stringify(topic));
  } catch {
    /* quota */
  }
}

export function loadPersistedSelectedTopic(): SyllabusTopicContext | null {
  try {
    const raw = localStorage.getItem(SELECTED_TOPIC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SyllabusTopicContext;
    if (!parsed?.id || !parsed?.title || parsed.syllabusId == null || !parsed.variantLabel) return null;
    if (!parsed.instructionLanguage) {
      parsed.instructionLanguage = 'uz';
    }
    if (!parsed.subjectCode) {
      parsed.subjectCode = '';
    }
    return parsed;
  } catch {
    return null;
  }
}

export function persistVariantBySubject(map: Record<number, string>): void {
  try {
    localStorage.setItem(VARIANT_BY_SUBJECT_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function loadPersistedVariantBySubject(): Record<number, string> {
  try {
    const raw = localStorage.getItem(VARIANT_BY_SUBJECT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const id = Number(k);
      if (!Number.isNaN(id) && v) out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}
