import {
  isTopicContextComplete,
  topicNormForStorage,
  topicNormLegacy,
  topicNormLookupKeys,
  type SyllabusTopicContext,
} from './syllabusTopicContext';
import { normTopicKey } from './preparedContentStore';

export function resolvePresentationTopicNorms(
  topic: string | SyllabusTopicContext,
): string[] {
  if (typeof topic === 'string') {
    const k = normTopicKey(topic);
    return k ? [k] : [];
  }
  if (!topic?.title) return [];
  if (isTopicContextComplete(topic)) {
    const keys = new Set<string>(topicNormLookupKeys(topic));
    try {
      keys.add(topicNormForStorage(topic));
    } catch {
      /* id yo'q */
    }
    return [...keys].filter(Boolean);
  }
  const fallbackTitle =
    typeof topic === 'object' && topic && 'title' in topic
      ? String((topic as { title?: string }).title || '')
      : '';
  return [topicNormLegacy(fallbackTitle)];
}

export function primaryPresentationTopicNorm(
  topic: string | SyllabusTopicContext,
): string {
  const norms = resolvePresentationTopicNorms(topic);
  if (norms.length) return norms[0];
  if (typeof topic === 'string') return normTopicKey(topic);
  const title = 'title' in topic ? String(topic.title || '') : '';
  return topicNormLegacy(title);
}

export async function extractPdfTextFromBlob(blob: Blob): Promise<string> {
  const { pdfjsLib } = await import('./pdfjsSetup');
  const buffer = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const parts: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    parts.push(
      content.items.map((it) => ('str' in it ? String(it.str) : '')).join(' '),
    );
  }
  return parts.join('\n').trim();
}
