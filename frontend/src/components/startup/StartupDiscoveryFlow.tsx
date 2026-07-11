import React from 'react';
import { ClipboardList, FileText, Loader2, Sparkles } from 'lucide-react';
import type { TwentyCriteriaEvaluation } from '../../utils/startupEvaluationTypes';
import { isStartupMarketReadyForDocuments } from '../../utils/startupEvaluationTypes';
import type { StartupQuestionnaireState } from '../../utils/startupQuestionnaireModel';
import { STARTUP_TWENTY_CRITERIA } from '../../utils/startupTwentyCriteria';
import { useUiText } from '../../i18n/useUiText';

function titleForCriterion(id: string): string {
  return STARTUP_TWENTY_CRITERIA.find((c) => c.id === id)?.title ?? id;
}

export default function StartupDiscoveryFlow({
  formDisabled,
  stage1AnalysisDone,
  questionnaire,
  onQuestionnaireChange,
  evaluation,
  generatingQuestions,
  evaluating,
  generatingWord,
  onGenerateQuestions,
  onEvaluate,
  onDownloadWord,
}: {
  formDisabled: boolean;
  stage1AnalysisDone: boolean;
  questionnaire: StartupQuestionnaireState;
  onQuestionnaireChange: (next: StartupQuestionnaireState) => void;
  evaluation: TwentyCriteriaEvaluation | null;
  generatingQuestions: boolean;
  evaluating: boolean;
  generatingWord: boolean;
  onGenerateQuestions: () => void;
  onEvaluate: () => void;
  onDownloadWord: () => void;
}) {
  const { t } = useUiText();
  const items = questionnaire.items;
  const answers = questionnaire.answers;

  const minAnswerLen = 5;
  const allAnswersFilled =
    items.length > 0 &&
    items.every((it) => (answers[it.id] ?? '').trim().length >= minAnswerLen);

  const wordAllowed = evaluation != null && isStartupMarketReadyForDocuments(evaluation);

  const setAnswer = (id: string, value: string) => {
    onQuestionnaireChange({
      ...questionnaire,
      answers: { ...questionnaire.answers, [id]: value },
    });
  };

  return (
    <section className="rounded-2xl border border-violet-200/80 bg-gradient-to-b from-violet-50/90 to-white shadow-sm flex flex-col min-h-0 max-h-[min(85dvh,720px)] overflow-hidden">
      <div className="sticky top-0 z-20 shrink-0 border-b border-violet-200/70 bg-violet-50/95 backdrop-blur-md px-4 py-3 space-y-2 shadow-sm">
        <div>
          <p className="text-[11px] font-bold text-violet-800 uppercase tracking-wide">
            {t('startup.discoveryStageTitle')}
          </p>
          <p className="text-[12px] text-black/70 mt-1 leading-snug">{t('startup.discoveryStageDescription')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={formDisabled || generatingQuestions || !stage1AnalysisDone}
            title={!stage1AnalysisDone ? t('startup.stage2DisabledHint') : undefined}
            onClick={onGenerateQuestions}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 sm:px-4 sm:py-2.5 text-[12px] sm:text-[13px] font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {generatingQuestions ? <Loader2 className="animate-spin" size={16} /> : <ClipboardList size={16} />}
            {t('startup.stage2Questions')}
          </button>
          <button
            type="button"
            title={!allAnswersFilled ? t('startup.stage3DisabledHint', { min: minAnswerLen }) : undefined}
            disabled={formDisabled || evaluating || !allAnswersFilled}
            onClick={onEvaluate}
            className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-600 px-3 py-2 sm:px-4 sm:py-2.5 text-[12px] sm:text-[13px] font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {evaluating ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
            {t('startup.stage3Criteria')}
          </button>
          <button
            type="button"
            disabled={generatingWord || !wordAllowed}
            title={!wordAllowed ? t('startup.stage4DisabledHint') : undefined}
            onClick={onDownloadWord}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/80 bg-emerald-50 px-3 py-2 sm:px-4 sm:py-2.5 text-[12px] sm:text-[13px] font-semibold text-emerald-900 disabled:opacity-45"
          >
            {generatingWord ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
            {t('startup.stage4Word')}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-[180px] overflow-y-auto overscroll-y-contain px-4 py-3 space-y-3">
        {!stage1AnalysisDone ? (
          <p className="text-[12px] text-amber-900/90 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-relaxed">
            {t('startup.stage1Required')}
          </p>
        ) : items.length === 0 ? (
          <p className="text-[12px] text-black/50 leading-relaxed">{t('startup.generateQuestionsPrompt')}</p>
        ) : (
          items.map((it, idx) => (
            <div
              key={it.id}
              className="rounded-xl border border-black/10 bg-white p-3 sm:p-3.5 space-y-2 shadow-sm scroll-mt-28"
            >
              <p className="text-[12px] font-semibold text-violet-900/90">
                {t('startup.questionNumber', { number: idx + 1 })}
              </p>
              <p className="text-[13px] font-medium text-black/90 leading-snug">{it.question}</p>
              {it.hint ? <p className="text-[11px] text-black/45 italic leading-snug">{it.hint}</p> : null}
              <textarea
                value={answers[it.id] ?? ''}
                onChange={(e) => setAnswer(it.id, e.target.value)}
                disabled={formDisabled}
                rows={4}
                className="w-full rounded-lg border border-black/12 bg-white px-3 py-2.5 text-[13px] leading-relaxed outline-none focus:ring-2 focus:ring-violet-300/50 disabled:opacity-60 resize-y min-h-[96px]"
                placeholder={t('startup.answerPlaceholder', { min: minAnswerLen })}
              />
            </div>
          ))
        )}
      </div>

      {evaluation && (
        <div className="shrink-0 border-t border-black/10 bg-white/98 max-h-[min(42vh,380px)] overflow-y-auto px-4 py-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-bold text-black/90">{t('startup.evaluationResult')}</p>
            <span className="text-[12px] font-bold tabular-nums text-violet-800 bg-violet-100 rounded-full px-3 py-0.5">
              {t('startup.evaluationVerdict', { score: evaluation.overall_0_100 })}
            </span>
          </div>
          <p className="text-[13px] text-black/80 whitespace-pre-wrap leading-relaxed">{evaluation.verdict_uz}</p>
          {!wordAllowed && (
            <p className="text-[12px] font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-snug">
              {t('startup.wordRestricted')}
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border border-black/8">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="bg-black/[0.04]">
                  <th className="p-2 font-semibold text-black/70">{t('startup.criterion')}</th>
                  <th className="p-2 font-semibold text-black/70 w-12">1–5</th>
                  <th className="p-2 font-semibold text-black/70">{t('startup.evaluationComment')}</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.criteria.map((r) => (
                  <tr key={r.id} className="border-t border-black/6">
                    <td className="p-2 text-black/85 align-top">{titleForCriterion(r.id)}</td>
                    <td className="p-2 tabular-nums font-semibold text-violet-800 align-top">{r.score_1_to_5}</td>
                    <td className="p-2 text-black/70 align-top">{r.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
