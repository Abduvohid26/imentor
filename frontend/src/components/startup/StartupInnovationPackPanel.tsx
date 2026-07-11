import React from 'react';
import {
  BarChart3,
  Beaker,
  Building2,
  CalendarRange,
  ClipboardCheck,
  Layers,
  Scale,
  ShieldAlert,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { computeWeightedScoringMatrix } from '../../utils/startupProjectQuality';
import { useUiText } from '../../i18n/useUiText';

function SectionShell({
  icon: Icon,
  title,
  subtitle,
  accent = 'violet',
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  subtitle?: string;
  accent?: 'violet' | 'emerald' | 'amber' | 'sky' | 'rose';
  children: React.ReactNode;
}) {
  const ring =
    accent === 'emerald'
      ? 'border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white'
      : accent === 'amber'
        ? 'border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-white'
        : accent === 'sky'
          ? 'border-sky-200/80 bg-gradient-to-br from-sky-50/80 to-white'
          : accent === 'rose'
            ? 'border-rose-200/80 bg-gradient-to-br from-rose-50/70 to-white'
            : 'border-violet-200/80 bg-gradient-to-br from-violet-50/80 to-white';
  const iconBg =
    accent === 'emerald'
      ? 'bg-emerald-600'
      : accent === 'amber'
        ? 'bg-amber-500'
        : accent === 'sky'
          ? 'bg-sky-600'
          : accent === 'rose'
            ? 'bg-rose-600'
            : 'bg-violet-600';

  return (
    <section
      className={`rounded-2xl border ${ring} p-4 sm:p-5 shadow-sm`}
    >
      <div className="flex items-start gap-3 mb-3">
        <div
          className={`w-10 h-10 rounded-xl ${iconBg} text-white flex items-center justify-center shrink-0 shadow-md`}
        >
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-black/90 leading-snug">{title}</h3>
          {subtitle && <p className="text-[12px] text-black/50 mt-0.5 leading-relaxed">{subtitle}</p>}
        </div>
      </div>
      <div className="text-[13px] text-black/80 space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function StrBlock({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap">{text}</p>;
}

function StringList({ items }: { items: unknown[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="break-words">
          {typeof it === 'string' ? it : JSON.stringify(it)}
        </li>
      ))}
    </ul>
  );
}

function ArchetypeBadge({ v }: { v: string }) {
  const { t } = useUiText();
  const u = v.toLowerCase();
  const label =
    u.includes('research') || u.includes('ilmiy')
      ? t('startup.archetypeResearch')
      : u.includes('commercial') || u.includes('startup')
        ? t('startup.archetypeCommercial')
        : u.includes('hybrid')
          ? t('startup.archetypeHybrid')
          : v;
  return (
    <span className="inline-flex items-center rounded-full bg-black/[0.06] px-3 py-1 text-[12px] font-semibold text-black/80 border border-black/10">
      {label}
    </span>
  );
}

export default function StartupInnovationPackPanel({ pack }: { pack: Record<string, unknown> }) {
  const { t } = useUiText();
  if (!pack || Object.keys(pack).length === 0) return null;

  const arch = typeof pack.project_archetype === 'string' ? pack.project_archetype : '';
  const archWhy = typeof pack.archetype_rationale === 'string' ? pack.archetype_rationale : '';

  const oneLine =
    typeof pack.one_line_positioning === 'string'
      ? pack.one_line_positioning
      : typeof pack.elevator_pitch === 'string'
        ? pack.elevator_pitch
        : '';

  const valueProp =
    typeof pack.value_proposition === 'string'
      ? pack.value_proposition
      : typeof pack.problem_and_solution === 'string'
        ? pack.problem_and_solution
        : '';

  const market = pack.market_analysis;
  const comp = pack.competitive_landscape;
  const tract = pack.traction_readiness;
  const sci = pack.scientific_research_block;
  const teamEx = pack.team_and_execution;
  const road = pack.milestone_roadmap;
  const grant = pack.grant_and_partnership_fit;
  const investor = pack.investor_style_outline;
  const scores = pack.scoring_matrix;
  const risks = pack.risk_register;
  const docs = pack.recommended_documents;
  const fjsti = typeof pack.fjsti_institutional_fit === 'string' ? pack.fjsti_institutional_fit : '';
  const fjstiLegacy =
    typeof pack.institutional_alignment === 'string' ? pack.institutional_alignment : '';
  const ethics =
    typeof pack.ethics_clinical_regulatory_note === 'string' ? pack.ethics_clinical_regulatory_note : '';
  const diff =
    typeof pack.differentiation_and_moat === 'string'
      ? pack.differentiation_and_moat
      : typeof pack.innovation_summary === 'string'
        ? pack.innovation_summary
        : '';

  const disclaimer =
    typeof pack.disclaimer_note === 'string' ? pack.disclaimer_note : '';

  const matrixStats =
    !Array.isArray(scores) || scores.length === 0
      ? null
      : computeWeightedScoringMatrix(scores as Record<string, unknown>[]);

  const readinessNum =
    isObj(tract) && typeof tract.readiness_score_1_to_100 === 'number'
      ? (tract.readiness_score_1_to_100 as number)
      : null;

  return (
    <div className="space-y-4">
      {(readinessNum != null || matrixStats?.weightedAvg1to5 != null) && (
        <div className="rounded-2xl border border-black/10 bg-white/90 p-4 shadow-sm flex flex-wrap gap-4 items-stretch">
          {readinessNum != null && (
            <div className="min-w-[140px] flex-1">
              <p className="text-[11px] font-semibold text-black/45 uppercase tracking-wide mb-1">
                {t('startup.innovationPackReadiness')}
              </p>
              <p className="text-[28px] font-black text-emerald-700 tabular-nums leading-none">
                {readinessNum}
                <span className="text-[13px] font-semibold text-black/45">/100</span>
              </p>
              <div className="mt-2 h-2 rounded-full bg-black/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.min(100, Math.max(0, readinessNum))}%` }}
                />
              </div>
            </div>
          )}
          {matrixStats?.weightedAvg1to5 != null && (
            <div className="min-w-[160px] flex-1 border-l border-black/10 pl-4">
              <p className="text-[11px] font-semibold text-black/45 uppercase tracking-wide mb-1">
                {t('startup.innovationPackMatrix')}
              </p>
              <p className="text-[22px] font-black text-violet-700 tabular-nums">
                {matrixStats.weightedAvg1to5.toFixed(2)}
                <span className="text-[13px] font-semibold text-black/45">/5</span>
              </p>
              {matrixStats.percent100 != null && (
                <p className="text-[12px] text-black/55 mt-1">
                  {t('startup.innovationRelativeLine', {
                    percent: matrixStats.percent100,
                    count: matrixStats.rowCount,
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {(arch || archWhy || oneLine) && (
        <div className="rounded-2xl border border-violet-300/60 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-indigo-700 p-5 text-white shadow-lg">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Layers size={18} className="opacity-90" />
            <span className="text-[11px] font-bold uppercase tracking-widest opacity-90">
              {t('startup.strategicProfile')}
            </span>
          </div>
          {arch && (
            <div className="mb-2">
              <ArchetypeBadge v={arch} />
            </div>
          )}
          {archWhy && (
            <p className="text-[13px] leading-relaxed opacity-95 mb-3">
              {archWhy}
            </p>
          )}
          {oneLine && (
            <blockquote className="border-l-4 border-white/50 pl-4 text-[15px] font-semibold leading-snug">
              {oneLine}
            </blockquote>
          )}
        </div>
      )}

      {valueProp && (
        <SectionShell icon={Target} title={t('startup.valueProposition')} accent="emerald">
          <StrBlock text={valueProp} />
        </SectionShell>
      )}

      {isObj(market) && (
        <SectionShell
          icon={TrendingUp}
          title={t('startup.marketAnalysis')}
          subtitle={t('startup.marketAnalysisSubtitle')}
          accent="sky"
        >
          {typeof market.serviceable_context === 'string' && (
            <StrBlock text={market.serviceable_context as string} />
          )}
          {typeof market.market_sizing_notes === 'string' && (
            <div className="mt-2 rounded-xl bg-white/70 border border-black/5 p-3">
              <p className="text-[11px] font-semibold text-black/45 mb-1">{t('startup.marketSize')}</p>
              <StrBlock text={market.market_sizing_notes as string} />
            </div>
          )}
          {Array.isArray(market.customer_and_payer_segments) && (
            <div className="mt-2">
              <p className="text-[11px] font-semibold text-black/45 mb-1">{t('startup.customerSegments')}</p>
              <StringList items={market.customer_and_payer_segments as unknown[]} />
            </div>
          )}
          {Array.isArray(market.market_trends_relevant) && (
            <div className="mt-2">
              <p className="text-[11px] font-semibold text-black/45 mb-1">{t('startup.marketTrends')}</p>
              <StringList items={market.market_trends_relevant as unknown[]} />
            </div>
          )}
          {Array.isArray(market.go_to_market_hooks) && (
            <div className="mt-2">
              <p className="text-[11px] font-semibold text-black/45 mb-1">{t('startup.goToMarket')}</p>
              <StringList items={market.go_to_market_hooks as unknown[]} />
            </div>
          )}
        </SectionShell>
      )}

      {diff && (
        <SectionShell
          icon={BarChart3}
          title={t('startup.differentiation')}
          accent="violet"
        >
          <StrBlock text={diff} />
        </SectionShell>
      )}

      {Array.isArray(comp) && comp.length > 0 && (
        <SectionShell
          icon={Layers}
          title={t('startup.competition')}
          subtitle={t('startup.competitionSubtitle')}
        >
          <div className="overflow-x-auto rounded-xl border border-black/10 bg-white/80">
            <table className="w-full text-[12px]">
              <thead className="bg-black/[0.04] text-black/55 text-left">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t('startup.competitionItem')}</th>
                  <th className="px-3 py-2 font-semibold w-14">{t('startup.competitionScore')}</th>
                  <th className="px-3 py-2 font-semibold">{t('startup.competitionSimilarity')}</th>
                  <th className="px-3 py-2 font-semibold">{t('startup.competitionTakeaway')}</th>
                </tr>
              </thead>
              <tbody>
                {(comp as Record<string, unknown>[]).map((row, i) => (
                  <tr key={i} className="border-t border-black/5 align-top">
                    <td className="px-3 py-2 font-medium">
                      {String(row.name_or_category ?? row.item ?? '—')}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {String(row.similarity_score_1_to_5 ?? row.similarity_1_to_5 ?? '—')}
                    </td>
                    <td className="px-3 py-2">
                      {String(row.how_similar_or_different ?? '')}
                    </td>
                    <td className="px-3 py-2">
                      {String(row.strategic_takeaway ?? row.takeaway ?? '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionShell>
      )}

      {isObj(tract) && (
        <SectionShell
          icon={ClipboardCheck}
          title={t('startup.traction')}
          subtitle={t('startup.tractionSubtitle')}
          accent="emerald"
        >
          <div className="flex flex-wrap items-center gap-3 mb-2">
            {typeof tract.estimated_stage === 'string' && (
              <span className="rounded-lg bg-emerald-100 text-emerald-900 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">
                {tract.estimated_stage as string}
              </span>
            )}
            {typeof tract.readiness_score_1_to_100 === 'number' && (
              <span className="text-[28px] font-black text-emerald-700 tabular-nums leading-none">
                {tract.readiness_score_1_to_100}
                <span className="text-[12px] font-semibold text-black/45">/100</span>
              </span>
            )}
          </div>
          {Array.isArray(tract.score_breakdown) && (
            <div className="mb-2">
              <p className="text-[11px] font-semibold text-black/45 mb-1">{t('startup.tractionScoreBreakdown')}</p>
              <StringList items={tract.score_breakdown as unknown[]} />
            </div>
          )}
          {Array.isArray(tract.strongest_evidence_in_text) && (
            <div className="mb-2">
              <p className="text-[11px] font-semibold text-black/45 mb-1">{t('startup.tractionEvidence')}</p>
              <StringList items={tract.strongest_evidence_in_text as unknown[]} />
            </div>
          )}
          {Array.isArray(tract.critical_gaps) && (
            <div className="mb-2">
              <p className="text-[11px] font-semibold text-rose-700 mb-1">{t('startup.tractionGaps')}</p>
              <StringList items={tract.critical_gaps as unknown[]} />
            </div>
          )}
          {Array.isArray(tract.what_would_raise_readiness_fastest) && (
            <div>
              <p className="text-[11px] font-semibold text-black/45 mb-1">{t('startup.tractionImprovements')}</p>
              <StringList items={tract.what_would_raise_readiness_fastest as unknown[]} />
            </div>
          )}
        </SectionShell>
      )}

      {isObj(sci) && (
        <SectionShell
          icon={Beaker}
          title={t('startup.scientificBlock')}
          subtitle={t('startup.scientificSubtitle')}
          accent="sky"
        >
          {typeof sci.research_question === 'string' && (
            <div className="mb-2">
              <p className="text-[11px] font-semibold text-black/45 mb-0.5">{t('startup.researchQuestionLabel')}</p>
              <StrBlock text={sci.research_question} />
            </div>
          )}
          {typeof sci.hypothesis_or_innovation_claim === 'string' && (
            <div className="mb-2">
              <p className="text-[11px] font-semibold text-black/45 mb-0.5">{t('startup.innovationClaim')}</p>
              <StrBlock text={sci.hypothesis_or_innovation_claim} />
            </div>
          )}
          {typeof sci.evidence_user_already_has === 'string' && (
            <div className="mb-2">
              <p className="text-[11px] font-semibold text-black/45 mb-0.5">{t('startup.existingEvidence')}</p>
              <StrBlock text={sci.evidence_user_already_has} />
            </div>
          )}
          {typeof sci.evidence_still_needed === 'string' && (
            <div className="mb-2">
              <p className="text-[11px] font-semibold text-rose-700 mb-0.5">{t('startup.neededEvidence')}</p>
              <StrBlock text={sci.evidence_still_needed} />
            </div>
          )}
          {typeof sci.methodology_completeness === 'string' && (
            <div className="mb-2">
              <p className="text-[11px] font-semibold text-black/45 mb-0.5">{t('startup.methodologyCompleteness')}</p>
              <StrBlock text={sci.methodology_completeness} />
            </div>
          )}
          {typeof sci.peer_review_comparables === 'string' && (
            <div className="mb-2">
              <p className="text-[11px] font-semibold text-black/45 mb-0.5">{t('startup.peerReview')}</p>
              <StrBlock text={sci.peer_review_comparables} />
            </div>
          )}
          {Array.isArray(sci.how_to_strengthen_proof) && (
            <div>
              <p className="text-[11px] font-semibold text-black/45 mb-1">{t('startup.strengthenProof')}</p>
              <StringList items={sci.how_to_strengthen_proof as unknown[]} />
            </div>
          )}
        </SectionShell>
      )}

      {(fjsti || fjstiLegacy) && (
        <SectionShell icon={Building2} title={t('startup.fjstiFit')} accent="violet">
          <StrBlock text={fjsti || fjstiLegacy} />
        </SectionShell>
      )}

      {ethics && (
        <SectionShell
          icon={ShieldAlert}
          title={t('startup.ethics')}
          accent="amber"
        >
          <StrBlock text={ethics} />
        </SectionShell>
      )}

      {isObj(teamEx) && (
        <SectionShell icon={Users} title={t('startup.teamExecution')} accent="violet">
          {Array.isArray(teamEx.roles_to_fill) && (
            <div className="space-y-2">
              {(teamEx.roles_to_fill as Record<string, unknown>[]).map((r, i) => (
                <div key={i} className="rounded-xl bg-white/70 border border-black/5 p-3">
                  <p className="font-semibold text-black/90">{String(r.role ?? '')}</p>
                  {typeof r.why === 'string' && <p className="text-black/70 mt-1">{r.why}</p>}
                  {typeof r.suggested_profile === 'string' && (
                    <p className="text-[12px] text-black/55 mt-1">{r.suggested_profile}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {Array.isArray(teamEx.advisor_mentor_suggestions) && (
            <div className="mt-2">
              <p className="text-[11px] font-semibold text-black/45 mb-1">{t('startup.advisors')}</p>
              <StringList items={teamEx.advisor_mentor_suggestions as unknown[]} />
            </div>
          )}
        </SectionShell>
      )}

      {isObj(road) && (
        <SectionShell
          icon={CalendarRange}
          title={t('startup.roadmap')}
          subtitle={t('startup.roadmapSubtitle')}
          accent="emerald"
        >
          {Array.isArray(road.next_30_days) && (
            <div className="mb-3">
              <p className="text-[11px] font-bold text-emerald-800 mb-1">{t('startup.roadmap30')}</p>
              <StringList items={road.next_30_days as unknown[]} />
            </div>
          )}
          {Array.isArray(road.next_90_days) && (
            <div className="mb-3">
              <p className="text-[11px] font-bold text-emerald-800 mb-1">{t('startup.roadmap90')}</p>
              <StringList items={road.next_90_days as unknown[]} />
            </div>
          )}
          {Array.isArray(road.next_12_months) && (
            <div className="mb-3">
              <p className="text-[11px] font-bold text-emerald-800 mb-1">{t('startup.roadmap12')}</p>
              <StringList items={road.next_12_months as unknown[]} />
            </div>
          )}
          {Array.isArray(road.key_milestones) && (
            <div className="overflow-x-auto rounded-xl border border-black/10">
              <table className="w-full text-[12px]">
                <thead className="bg-black/[0.04]">
                  <tr>
                    <th className="text-left px-3 py-2">{t('startup.milestone')}</th>
                    <th className="text-left px-3 py-2">{t('startup.metric')}</th>
                    <th className="text-left px-3 py-2">{t('startup.risk')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(road.key_milestones as Record<string, unknown>[]).map((m, i) => (
                    <tr key={i} className="border-t border-black/5">
                      <td className="px-3 py-2 font-medium">{String(m.title ?? '')}</td>
                      <td className="px-3 py-2">{String(m.success_metric ?? '')}</td>
                      <td className="px-3 py-2">{String(m.dependency_risk ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionShell>
      )}

      {isObj(grant) && (
        <SectionShell icon={Scale} title={t('startup.grantFit')} accent="sky">
          {Array.isArray(grant.likely_grant_or_program_types) && (
            <div className="mb-2">
              <p className="text-[11px] font-semibold text-black/45 mb-1">{t('startup.grantTypes')}</p>
              <StringList items={grant.likely_grant_or_program_types as unknown[]} />
            </div>
          )}
          {Array.isArray(grant.evidence_package_to_prepare) && (
            <div>
              <p className="text-[11px] font-semibold text-black/45 mb-1">{t('startup.evidencePackage')}</p>
              <StringList items={grant.evidence_package_to_prepare as unknown[]} />
            </div>
          )}
        </SectionShell>
      )}

      {isObj(investor) &&
        (() => {
          const blocks = (
            [
              ['problem_hook', t('startup.problemHook')],
              ['solution_and_why_now', t('startup.solutionWhy')],
              ['business_model_sketch', t('startup.businessModel')],
              ['impact_metrics', t('startup.impactMetrics')],
              ['the_ask', t('startup.theAsk')],
            ] as const
          )
            .map(([key, labelUz]) => {
              const val = (investor as Record<string, unknown>)[key];
              if (val == null || (typeof val === 'string' && !val.trim())) return null;
              return (
                <div key={key} className="mb-2 last:mb-0">
                  <p className="text-[11px] font-semibold text-black/45 mb-0.5">{labelUz}</p>
                  {Array.isArray(val) ? (
                    <StringList items={val as unknown[]} />
                  ) : (
                    <StrBlock text={String(val ?? '')} />
                  )}
                </div>
              );
            })
            .filter(Boolean);
          if (blocks.length === 0) return null;
          return (
            <SectionShell icon={Target} title={t('startup.investorOutline')} accent="violet">
              {blocks}
            </SectionShell>
          );
        })()}

      {Array.isArray(scores) && scores.length > 0 && (
        <SectionShell icon={BarChart3} title={t('startup.scoringMatrix')}>
          <div className="overflow-x-auto rounded-xl border border-black/10 bg-white/80">
            <table className="w-full text-[12px]">
              <thead className="bg-black/[0.04]">
                <tr>
                  <th className="text-left px-3 py-2">{t('startup.criterion')}</th>
                  <th className="px-3 py-2">{t('startup.weight')}</th>
                  <th className="px-3 py-2">{t('startup.score')}</th>
                  <th className="text-left px-3 py-2">{t('startup.scoringComment')}</th>
                </tr>
              </thead>
              <tbody>
                {(scores as Record<string, unknown>[]).map((row, i) => (
                  <tr key={i} className="border-t border-black/5">
                    <td className="px-3 py-2 font-medium">{String(row.criterion ?? '')}</td>
                    <td className="px-3 py-2 tabular-nums text-center">
                      {String(row.weight_1_to_5 ?? '—')}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-center font-bold text-violet-700">
                      {String(row.project_score_1_to_5 ?? row.score_1_to_5 ?? '—')}
                    </td>
                    <td className="px-3 py-2">{String(row.comment ?? row.rationale ?? '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionShell>
      )}

      {Array.isArray(risks) && risks.length > 0 && (
        <SectionShell icon={ShieldAlert} title={t('startup.riskRegister')} accent="rose">
          <div className="overflow-x-auto rounded-xl border border-rose-100 bg-white/90">
            <table className="w-full text-[12px]">
              <thead className="bg-rose-50">
                <tr>
                  <th className="text-left px-3 py-2">{t('startup.risk')}</th>
                  <th className="px-3 py-2">{t('startup.likelihood')}</th>
                  <th className="px-3 py-2">{t('startup.impact')}</th>
                  <th className="text-left px-3 py-2">{t('startup.mitigation')}</th>
                </tr>
              </thead>
              <tbody>
                {(risks as Record<string, unknown>[]).map((row, i) => (
                  <tr key={i} className="border-t border-rose-100 align-top">
                    <td className="px-3 py-2">{String(row.risk ?? '')}</td>
                    <td className="px-3 py-2 tabular-nums text-center">
                      {String(row.likelihood_1_to_5 ?? '—')}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-center">
                      {String(row.impact_1_to_5 ?? '—')}
                    </td>
                    <td className="px-3 py-2">{String(row.mitigation ?? '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionShell>
      )}

      {Array.isArray(docs) && docs.length > 0 && (
        <SectionShell icon={ClipboardCheck} title={t('startup.recommendedDocs')}>
          <div className="space-y-3">
            {(docs as Record<string, unknown>[]).map((d, i) => (
              <div key={i} className="rounded-xl border border-black/8 bg-white/70 p-3">
                <p className="font-bold text-black/90">{String(d.document ?? d.name ?? '')}</p>
                {typeof d.purpose === 'string' && <p className="text-black/65 mt-1">{d.purpose}</p>}
                {Array.isArray(d.must_include_sections) && (
                  <ul className="list-disc pl-5 mt-2 text-black/75 text-[12px]">
                    {(d.must_include_sections as string[]).map((s, j) => (
                      <li key={j}>{s}</li>
                    ))}
                  </ul>
                )}
                {Array.isArray(d.key_sections) &&
                  !Array.isArray(d.must_include_sections) &&
                  (d.key_sections as string[]).map((s, j) => (
                    <p key={j} className="text-[12px] text-black/65 mt-1">
                      • {s}
                    </p>
                  ))}
              </div>
            ))}
          </div>
        </SectionShell>
      )}

      {disclaimer && (
        <p className="text-[11px] text-black/45 border border-black/10 rounded-xl p-3 bg-black/[0.02]">
          {disclaimer}
        </p>
      )}

      <FallbackUnknownKeys pack={pack} />
    </div>
  );
}

/** Renders keys not covered above — still readable, no raw JSON walls */
function FallbackUnknownKeys({ pack }: { pack: Record<string, unknown> }) {
  const { t } = useUiText();
  const skip = new Set([
    'project_archetype',
    'archetype_rationale',
    'one_line_positioning',
    'elevator_pitch',
    'value_proposition',
    'problem_and_solution',
    'market_analysis',
    'differentiation_and_moat',
    'innovation_summary',
    'competitive_landscape',
    'traction_readiness',
    'scientific_research_block',
    'fjsti_institutional_fit',
    'institutional_alignment',
    'ethics_clinical_regulatory_note',
    'team_and_execution',
    'milestone_roadmap',
    'grant_and_partnership_fit',
    'investor_style_outline',
    'scoring_matrix',
    'risk_register',
    'recommended_documents',
    'disclaimer_note',
    'standards_checklist',
    'suggested_pdf_outline',
    'application_documents',
    'next_steps',
    'coach_thread',
  ]);

  const rest = Object.entries(pack).filter(([k]) => !skip.has(k));
  if (rest.length === 0) return null;

  return (
    <div className="rounded-2xl border border-dashed border-black/15 bg-white/40 p-4">
      <p className="text-[11px] font-bold text-black/45 uppercase tracking-wide mb-2">{t('startup.otherAnalysis')}</p>
      <div className="space-y-3">
        {rest.map(([k, v]) => (
          <div key={k}>
            <p className="text-[11px] font-semibold text-black/50 mb-1">{k.replace(/_/g, ' ')}</p>
            <PrettyValue value={v} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PrettyValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-black/35">—</span>;
  if (typeof value === 'string') return <StrBlock text={value} />;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span className="tabular-nums">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.every((x) => typeof x === 'string')) {
      return <StringList items={value} />;
    }
    return (
      <ul className="space-y-2">
        {value.map((item, i) => (
          <li key={i} className="rounded-lg bg-white/60 border border-black/5 p-2">
            {isObj(item) ? (
              <dl className="space-y-1 text-[12px]">
                {Object.entries(item).map(([kk, vv]) => (
                  <div key={kk}>
                    <dt className="font-semibold text-black/55 inline mr-1">{kk.replace(/_/g, ' ')}:</dt>
                    <dd className="inline text-black/80">
                      {typeof vv === 'object' ? JSON.stringify(vv) : String(vv)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <span>{String(item)}</span>
            )}
          </li>
        ))}
      </ul>
    );
  }
  if (isObj(value)) {
    return (
      <dl className="space-y-1.5 text-[12px] rounded-xl bg-white/60 border border-black/5 p-3">
        {Object.entries(value).map(([kk, vv]) => (
          <div key={kk}>
            <dt className="font-semibold text-black/55">{kk.replace(/_/g, ' ')}</dt>
            <dd className="text-black/80 mt-0.5">
              <PrettyValue value={vv} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span>{String(value)}</span>;
}
