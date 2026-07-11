/** Startap 20 mezon bahosi va Word hujjati uchun umumiy tiplar (docx / AI / UI). */

export type QuestionnaireItem = { id: string; question: string; hint?: string };

export type CriterionScoreRow = {
  id: string;
  score_1_to_5: number;
  comment: string;
};

export type TwentyCriteriaEvaluation = {
  criteria: CriterionScoreRow[];
  overall_0_100: number;
  ready_for_market: boolean;
  verdict_uz: string;
};

export type StartupDiscoveryQuestionnaireAi = {
  items: QuestionnaireItem[];
};

/** Word hujjatlari: model «tayyor» desa ham, umumiy ball juda past bo‘lmasin. */
export function isStartupMarketReadyForDocuments(ev: TwentyCriteriaEvaluation): boolean {
  return Boolean(ev.ready_for_market && ev.overall_0_100 >= 62);
}
