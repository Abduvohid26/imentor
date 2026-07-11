import type { QuestionnaireItem, StartupDiscoveryQuestionnaireAi } from './startupEvaluationTypes';

/** Model JSON → barqaror savollar ro‘yxati (id takrorlanmasin, 16 tagacha). */
export function normalizeQuestionnaireItemsFromAi(
  raw: StartupDiscoveryQuestionnaireAi | null | undefined
): QuestionnaireItem[] {
  const items = Array.isArray(raw?.items) ? raw!.items : [];
  const cleaned: QuestionnaireItem[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const id = typeof it.id === 'string' ? it.id.trim().replace(/\s+/g, '_') : '';
    const question = typeof it.question === 'string' ? it.question.trim() : '';
    if (!id || !question || seen.has(id)) continue;
    seen.add(id);
    const hint = typeof it.hint === 'string' ? it.hint.trim() : undefined;
    cleaned.push({ id, question, hint: hint || undefined });
    if (cleaned.length >= 26) break;
  }
  return cleaned.slice(0, 25);
}
