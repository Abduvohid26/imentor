import { STARTUP_TWENTY_CRITERIA } from './startupTwentyCriteria';
import type { TwentyCriteriaEvaluation } from './startupEvaluationTypes';

/**
 * Model JSON → barqaror 20 qator (c01…c20) + umumiy ball.
 */
export function normalizeTwentyCriteriaEvaluation(data: {
  criteria?: Array<{ id?: string; score_1_to_5?: number; comment?: string }>;
  overall_0_100?: number;
  ready_for_market?: boolean;
  verdict_uz?: string;
}): TwentyCriteriaEvaluation {
  const byId = new Map<string, { score: number; comment: string }>();
  for (const row of data.criteria ?? []) {
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    if (!id) continue;
    const scoreRaw = typeof row.score_1_to_5 === 'number' ? row.score_1_to_5 : 2;
    const score = Math.min(5, Math.max(1, Math.round(scoreRaw)));
    const comment = typeof row.comment === 'string' ? row.comment.trim() : '';
    byId.set(id, { score, comment: comment || '—' });
  }
  const criteria = STARTUP_TWENTY_CRITERIA.map((c) => {
    const x = byId.get(c.id);
    return {
      id: c.id,
      score_1_to_5: x?.score ?? 2,
      comment: x?.comment ?? '—',
    };
  });
  let overall = typeof data.overall_0_100 === 'number' ? Math.round(data.overall_0_100) : NaN;
  if (!Number.isFinite(overall)) {
    const sum = criteria.reduce((a, r) => a + r.score_1_to_5, 0);
    overall = Math.round((sum / (5 * criteria.length)) * 100);
  }
  overall = Math.min(100, Math.max(0, overall));
  const avg = criteria.reduce((a, r) => a + r.score_1_to_5, 0) / criteria.length;
  const readyModel =
    typeof data.ready_for_market === 'boolean' ? data.ready_for_market : overall >= 72 && avg >= 3.4;
  const modelVerdict =
    typeof data.verdict_uz === 'string' && data.verdict_uz.trim().length > 0
      ? data.verdict_uz.trim()
      : readyModel
        ? 'Loyiha yo‘nalishi va dalillar bo‘yicha keyingi bosqichga o‘tish mumkin.'
        : 'Asosiy tusbatan: dalillar, mijoz segmenti va tartibiy xavflarni yengillashtirish kerak.';
  const verdict_uz = readyModel
    ? modelVerdict
    : `Bu loyiha hozir bozorga tayyor emas. ${modelVerdict}`.replace(/\s+/g, ' ').trim();
  return {
    criteria,
    overall_0_100: overall,
    ready_for_market: readyModel,
    verdict_uz,
  };
}

export function parseTwentyCriteriaFromAiPack(raw: unknown): TwentyCriteriaEvaluation | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.criteria) || o.criteria.length < 15) return null;
  return normalizeTwentyCriteriaEvaluation({
    criteria: o.criteria as Array<{ id?: string; score_1_to_5?: number; comment?: string }>,
    overall_0_100: typeof o.overall_0_100 === 'number' ? o.overall_0_100 : undefined,
    ready_for_market: typeof o.ready_for_market === 'boolean' ? o.ready_for_market : undefined,
    verdict_uz: typeof o.verdict_uz === 'string' ? o.verdict_uz : undefined,
  });
}
