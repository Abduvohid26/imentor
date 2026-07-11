/**
 * Startap loyihasi uchun AI savolnoma (workspace_profile.startup_questionnaire).
 */

export type StartupQuestionnaireItem = { id: string; question: string; hint?: string };

export type StartupQuestionnaireState = {
  items: StartupQuestionnaireItem[];
  answers: Record<string, string>;
  generated_at?: number;
};

export const EMPTY_STARTUP_QUESTIONNAIRE: StartupQuestionnaireState = {
  items: [],
  answers: {},
};

function isQuestionnaireItem(x: unknown): x is StartupQuestionnaireItem {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === 'string' && o.id.length > 0 && typeof o.question === 'string';
}

export function parseStartupQuestionnaireFromProfile(raw: unknown): StartupQuestionnaireState {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_STARTUP_QUESTIONNAIRE };
  const sq = (raw as Record<string, unknown>).startup_questionnaire;
  if (!sq || typeof sq !== 'object') return { ...EMPTY_STARTUP_QUESTIONNAIRE };
  const o = sq as Record<string, unknown>;
  const itemsRaw = o.items;
  const items: StartupQuestionnaireItem[] = Array.isArray(itemsRaw)
    ? itemsRaw.filter(isQuestionnaireItem).map((it) => ({
        id: it.id.trim(),
        question: it.question.trim(),
        hint: typeof it.hint === 'string' ? it.hint.trim() : undefined,
      }))
    : [];
  const answers: Record<string, string> = {};
  const ar = o.answers;
  if (ar && typeof ar === 'object') {
    for (const [k, v] of Object.entries(ar as Record<string, unknown>)) {
      if (typeof v === 'string') answers[k] = v;
    }
  }
  const generated_at = typeof o.generated_at === 'number' ? o.generated_at : undefined;
  return { items, answers, generated_at };
}

/** Savolnoma javoblari — AI tahlil va 20 mezon uchun matn blok */
export function formatQuestionnaireForPrompt(state: StartupQuestionnaireState): string {
  if (!state.items.length) return '';
  const lines: string[] = ['Savolnoma va javoblar:'];
  for (const it of state.items) {
    const a = (state.answers[it.id] ?? '').trim() || '(javob berilmagan)';
    lines.push(`- [${it.id}] ${it.question}\n  Javob: ${a}`);
  }
  return lines.join('\n');
}
