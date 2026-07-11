import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Beaker,
  Briefcase,
  FileDown,
  Loader2,
  Plus,
  Rocket,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { getAppLanguage } from '../../i18n/language';
import { useUiText } from '../../i18n/useUiText';
import {
  fetchStartupDiscoveryQuestionnaire,
  fetchStartupInnovationCoachReply,
  fetchStartupInnovationPack,
  fetchStartupTwentyCriteria,
} from '../../services/startupAiApi';
import { buildStartupProfileSnapshot, getCurrentLocalUser } from '../../utils/localStaffAuth';
import {
  createStartupApplication,
  deleteStartupApplication,
  listMyStartupApplications,
  updateStartupApplication,
  type StartupApplicationDto,
} from '../../utils/startupApplicationApi';
import StartupInnovationPackPanel from './StartupInnovationPackPanel';
import StartupCoachChat, { type CoachTurn } from './StartupCoachChat';
import StartupDiscoveryFlow from './StartupDiscoveryFlow';
import StartupNewProjectDialog from './StartupNewProjectDialog';
import {
  buildStartupPackPrintInnerHtml,
  canRunStrategicInnovationAi,
  evaluateStartupQuestionnaireReadiness,
  hasMeaningfulAiPack,
} from '../../utils/startupProjectQuality';
import { buildStartupProjectWordBlob, downloadWordBlob } from '../../utils/buildStartupWordDoc';
import {
  EMPTY_STARTUP_QUESTIONNAIRE,
  formatQuestionnaireForPrompt,
  parseStartupQuestionnaireFromProfile,
  type StartupQuestionnaireState,
} from '../../utils/startupQuestionnaireModel';
import { parseTwentyCriteriaFromAiPack } from '../../utils/normalizeTwentyCriteriaResult';

/** Qo‘shimcha maydonlar — AI va saqlash uchun (workspace_profile) */
export type WorkspaceFields = {
  research_question?: string;
  methodology_notes?: string;
  beneficiaries_or_segments?: string;
  monetization_or_sustainability?: string;
  key_resources_team?: string;
  partners_lab_equipment?: string;
  /** Startap: hozirgi traksiya, suhbatlar, pilot, foydalanuvchilar */
  traction_validation_notes?: string;
  /** Startap: eng katta noaniqlik yoki xavf (bozor, texnologiya, tartib) */
  biggest_uncertainty?: string;
  /** Startap: AI savolnoma va javoblar (workspace_profile) */
  startup_questionnaire?: StartupQuestionnaireState;
};

const EMPTY_WORKSPACE: WorkspaceFields = {
  research_question: '',
  methodology_notes: '',
  beneficiaries_or_segments: '',
  monetization_or_sustainability: '',
  key_resources_team: '',
  partners_lab_equipment: '',
  traction_validation_notes: '',
  biggest_uncertainty: '',
  startup_questionnaire: { ...EMPTY_STARTUP_QUESTIONNAIRE },
};

function normalizeDomain(d: string | undefined): 'startup' | 'research' {
  return d === 'research' ? 'research' : 'startup';
}

function parseWorkspaceProfile(raw: unknown): WorkspaceFields {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_WORKSPACE };
  const o = raw as Record<string, unknown>;
  return {
    research_question: typeof o.research_question === 'string' ? o.research_question : '',
    methodology_notes: typeof o.methodology_notes === 'string' ? o.methodology_notes : '',
    beneficiaries_or_segments:
      typeof o.beneficiaries_or_segments === 'string' ? o.beneficiaries_or_segments : '',
    monetization_or_sustainability:
      typeof o.monetization_or_sustainability === 'string' ? o.monetization_or_sustainability : '',
    key_resources_team: typeof o.key_resources_team === 'string' ? o.key_resources_team : '',
    partners_lab_equipment: typeof o.partners_lab_equipment === 'string' ? o.partners_lab_equipment : '',
    traction_validation_notes:
      typeof o.traction_validation_notes === 'string' ? o.traction_validation_notes : '',
    biggest_uncertainty: typeof o.biggest_uncertainty === 'string' ? o.biggest_uncertainty : '',
    startup_questionnaire: parseStartupQuestionnaireFromProfile(o),
  };
}

/** Savolnomasiz — yangi savollar generatsiyasi uchun aylana bo‘lmasin */
function buildWorkspaceStructuredCore(f: WorkspaceFields, domain: 'startup' | 'research'): string {
  if (domain === 'research') {
    return [
      f.research_question && `Tadqiqot savoli / gipoteza: ${f.research_question}`,
      f.methodology_notes && `Metod va dizayn: ${f.methodology_notes}`,
      f.partners_lab_equipment && `Laboratoriya / uskunalar / hamkorlar: ${f.partners_lab_equipment}`,
      f.key_resources_team && `Resurslar va jamoa: ${f.key_resources_team}`,
    ]
      .filter(Boolean)
      .join('\n');
  }
  return [
    f.beneficiaries_or_segments && `Maqsadli mijoz / beneficiarlar: ${f.beneficiaries_or_segments}`,
    f.monetization_or_sustainability && `Monetizatsiya / barqarorlik: ${f.monetization_or_sustainability}`,
    f.traction_validation_notes && `Traksiya va tekshiruv: ${f.traction_validation_notes}`,
    f.biggest_uncertainty && `Eng katta noaniqlik / xavf: ${f.biggest_uncertainty}`,
    f.key_resources_team && `Jamoa va kalit resurslar: ${f.key_resources_team}`,
    f.partners_lab_equipment && `Hamkorlar, pilot maydon: ${f.partners_lab_equipment}`,
    f.research_question && `Qisman ilmiy savol (agar bor): ${f.research_question}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildWorkspaceExtraNote(f: WorkspaceFields, domain: 'startup' | 'research'): string {
  const core = buildWorkspaceStructuredCore(f, domain);
  const qBlock =
    domain === 'startup'
      ? formatQuestionnaireForPrompt(f.startup_questionnaire ?? EMPTY_STARTUP_QUESTIONNAIRE)
      : '';
  return [core, qBlock].filter(Boolean).join('\n\n');
}

function formatProjectLabel(x: StartupApplicationDto, untitled: string): string {
  const dom = normalizeDomain(x.project_domain);
  const icon = dom === 'research' ? '🔬' : '🚀';
  const name = (x.title || untitled).trim() || untitled;
  const shortSum = (x.summary || '').trim().slice(0, 40);
  const sumPart = shortSum ? ` — ${shortSum}${(x.summary || '').length > 40 ? '…' : ''}` : '';
  return `${icon} ${name} · #${x.id}${sumPart}${x.status === 'submitted' ? ' ✓' : ''}`;
}

function mergePackKeepCoach(
  newPack: Record<string, unknown>,
  oldPack: Record<string, unknown> | undefined
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...newPack };
  const thread = oldPack && Array.isArray((oldPack as { coach_thread?: unknown }).coach_thread)
    ? (oldPack as { coach_thread: CoachTurn[] }).coach_thread
    : undefined;
  if (thread && thread.length) merged.coach_thread = thread;
  const twenty = (oldPack as { twenty_criteria_evaluation?: unknown } | undefined)?.twenty_criteria_evaluation;
  if (twenty && typeof twenty === 'object') merged.twenty_criteria_evaluation = twenty;
  return merged;
}

function packForDisplay(pack: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!pack) return {};
  const { coach_thread: _c, twenty_criteria_evaluation: _t, ...rest } = pack;
  return rest;
}

function analysisExcerptForCoach(pack: Record<string, unknown> | undefined): string {
  const stripped = packForDisplay(pack);
  try {
    const s = JSON.stringify(stripped);
    return s.length > 14000 ? `${s.slice(0, 14000)}\n…[truncated]` : s;
  } catch {
    return '';
  }
}

function parseCoachThread(raw: unknown): CoachTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const o = x as Record<string, unknown>;
      const role = o.role === 'assistant' ? 'assistant' : 'user';
      const content = typeof o.content === 'string' ? o.content : '';
      if (!content) return null;
      const ts = typeof o.ts === 'number' ? o.ts : undefined;
      return { role, content, ts } as CoachTurn;
    })
    .filter(Boolean) as CoachTurn[];
}

export default function StartupWorkspace() {
  const { t } = useUiText();
  const printRef = useRef<HTMLDivElement | null>(null);

  const [items, setItems] = useState<StartupApplicationDto[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [coachSending, setCoachSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projectDomain, setProjectDomain] = useState<'startup' | 'research'>('startup');
  const [ws, setWs] = useState<WorkspaceFields>({ ...EMPTY_WORKSPACE });

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [participantKind, setParticipantKind] = useState<'student' | 'employee'>('student');

  const [questionnaireAiLoading, setQuestionnaireAiLoading] = useState(false);
  const [twentyEvalLoading, setTwentyEvalLoading] = useState(false);
  const [wordDocLoading, setWordDocLoading] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  const selected = useMemo(
    () => items.find((x) => x.id === selectedId) ?? null,
    [items, selectedId]
  );

  const coachTurns = useMemo(
    () => parseCoachThread(selected?.ai_pack?.coach_thread),
    [selected?.ai_pack]
  );

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const list = await listMyStartupApplications();
      setItems(list);
      setSelectedId((prev) => {
        if (list.length === 0) return null;
        if (prev != null && list.some((x) => x.id === prev)) return prev;
        return list[0].id;
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'no-backend-token' || msg.includes('HTTP 401')) {
        setError(t('startup.error.sessionExpired'));
      } else if (msg.includes('HTTP 403')) {
        setError(t('startup.error.forbiddenRole'));
      } else {
        setError(t('startup.error.loadFailed'));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setTitle(selected.title);
    const dom = normalizeDomain(selected.project_domain);
    if (dom === 'startup') {
      const desc = (selected.description ?? '').trim();
      const sum = (selected.summary ?? '').trim();
      setDescription(desc || sum);
      setSummary(sum || desc.slice(0, 360));
    } else {
      setSummary(selected.summary);
      setDescription(selected.description);
    }
    const pk = selected.participant_kind === 'employee' ? 'employee' : 'student';
    setParticipantKind(pk);
    setProjectDomain(dom);
    setWs(parseWorkspaceProfile(selected.workspace_profile));
  }, [selected?.id, selected?.updated_at]);

  const handleNewClick = () => {
    setError(null);
    setNewProjectOpen(true);
  };

  const handleNewProjectConfirm = async (payload: { title: string; summary: string }) => {
    setError(null);
    setSaving(true);
    try {
      const u = getCurrentLocalUser();
      if (!u) throw new Error('not-auth');
      const pk = u.participantKind ?? 'student';
      const domain = projectDomain;
      const initialPitch = payload.summary.trim();
      const row = await createStartupApplication({
        title: payload.title,
        summary: domain === 'startup' ? initialPitch.slice(0, 400) : payload.summary,
        description: domain === 'startup' || domain === 'research' ? initialPitch : '',
        participant_kind: pk,
        project_domain: domain,
        workspace_profile: {},
        profile_snapshot: buildStartupProfileSnapshot(u),
      });
      setItems((prev) => [row, ...prev]);
      setSelectedId(row.id);
      setWs({ ...EMPTY_WORKSPACE });
      setTitle(payload.title);
      if (domain === 'startup') {
        setDescription(initialPitch);
        setSummary(initialPitch.slice(0, 360));
      } else {
        setSummary(payload.summary);
        setDescription(domain === 'research' ? initialPitch : '');
      }
      setNewProjectOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'no-backend-token' || msg.includes('HTTP 401')) {
        setError(t('startup.error.sessionExpired'));
      } else {
        setError(t('startup.error.createFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selected || selected.status === 'submitted') return;
    setError(null);
    setSaving(true);
    try {
      const u = getCurrentLocalUser();
      if (!u) throw new Error('not-auth');
      const pitch = description.trim();
      const row = await updateStartupApplication(selected.id, {
        title: title.trim() || t('startup.untitledProject'),
        summary:
          projectDomain === 'startup'
            ? (pitch ? pitch.slice(0, 400) : summary.trim())
            : summary,
        description: projectDomain === 'startup' ? pitch : description,
        participant_kind: participantKind,
        project_domain: projectDomain,
        workspace_profile: { ...ws },
        profile_snapshot: buildStartupProfileSnapshot(u),
      });
      setItems((prev) => prev.map((x) => (x.id === row.id ? row : x)));
    } catch {
      setError(t('startup.error.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleAi = async () => {
    if (!selected || selected.status === 'submitted') return;
    const ev = canRunStrategicInnovationAi({
      title,
      summary,
      description,
      domain: projectDomain,
      ws,
    });
    if (!ev.ok) {
      setError(ev.blockMessages.join('\n\n'));
      return;
    }
    setError(null);
    setAiLoading(true);
    try {
      const u = getCurrentLocalUser();
      if (!u) throw new Error('not-auth');
      const profileLine = [
        `Fakultet: ${u.faculty}; Kafedra: ${u.department}; Yo‘nalish: ${u.direction}`,
        u.participantKind === 'employee'
          ? `Lavozim: ${u.jobTitle ?? '—'}`
          : `Guruh: ${u.studyGroup ?? '—'}`,
      ].join('. ');
      const extra = buildWorkspaceExtraNote(ws, projectDomain);
      const pitchText = (description.trim() || summary.trim()).trim();
      const rawPack = await fetchStartupInnovationPack(
        title.trim() || t('startup.defaultProjectTitle'),
        pitchText.slice(0, 500),
        pitchText,
        profileLine,
        getAppLanguage(),
        projectDomain,
        extra
      );
      const merged = mergePackKeepCoach(rawPack, selected.ai_pack);
      const row = await updateStartupApplication(selected.id, {
        ai_pack: merged,
        project_domain: projectDomain,
        workspace_profile: { ...ws },
        profile_snapshot: buildStartupProfileSnapshot(u),
      });
      setItems((prev) => prev.map((x) => (x.id === row.id ? row : x)));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('Failed to parse JSON') || msg.includes('parse')) {
        setError(t('startup.error.aiParseFailed'));
      } else {
        setError(t('startup.error.aiFailed'));
      }
    } finally {
      setAiLoading(false);
    }
  };

  const handleCoachSend = async (userText: string) => {
    if (!selected || selected.status === 'submitted') return;
    setCoachSending(true);
    setError(null);
    try {
      const u = getCurrentLocalUser();
      if (!u) throw new Error('not-auth');
      const prevThread = parseCoachThread(selected.ai_pack?.coach_thread);
      const nextUser: CoachTurn = { role: 'user', content: userText, ts: Date.now() };
      const messagesForModel = [...prevThread, nextUser];
      const pitchCtx = (description.trim() || summary.trim()).trim();
      const replyText = await fetchStartupInnovationCoachReply(
        messagesForModel.map(({ role, content }) => ({ role, content })),
        {
          project_domain: projectDomain,
          title: title.trim() || t('startup.defaultProjectTitle'),
          summary: projectDomain === 'startup' ? pitchCtx.slice(0, 500) : summary,
          description: projectDomain === 'startup' ? pitchCtx : description,
          workspace_profile_json: JSON.stringify(ws),
          analysis_json_excerpt: analysisExcerptForCoach(selected.ai_pack),
        },
        getAppLanguage()
      );
      const assistantTurn: CoachTurn = {
        role: 'assistant',
        content: replyText,
        ts: Date.now(),
      };
      const newThread = [...prevThread, nextUser, assistantTurn].slice(-40);
      const mergedPack = {
        ...(selected.ai_pack || {}),
        coach_thread: newThread,
      };
      const row = await updateStartupApplication(selected.id, {
        ai_pack: mergedPack,
        profile_snapshot: buildStartupProfileSnapshot(u),
      });
      setItems((prev) => prev.map((x) => (x.id === row.id ? row : x)));
    } catch {
      setError(t('startup.error.coachFailed'));
    } finally {
      setCoachSending(false);
    }
  };

  const handleDelete = async () => {
    if (!selected || selected.status === 'submitted') return;
    if (!window.confirm(t('startup.error.confirmDeleteProject'))) return;
    setError(null);
    setSaving(true);
    try {
      await deleteStartupApplication(selected.id);
      setItems((prev) => {
        const next = prev.filter((x) => x.id !== selected.id);
        setSelectedId(next[0]?.id ?? null);
        return next;
      });
    } catch {
      setError(t('startup.error.deleteFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const w = window.open('', '_blank', 'width=900,height=1200');
    if (!w) return;
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${t('startup.printDocumentTitle')}</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;color:#111;line-height:1.45;max-width:880px;margin:0 auto}
        h1{font-size:20px} h2{font-size:15px;margin-top:1.15em} h3{font-size:13px;margin-top:0.9em}
        table{margin-top:8px} @media print{body{padding:0}}
      </style></head><body>${printRef.current.innerHTML}</body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  const isReadOnly = selected?.status === 'submitted';

  const displayPack = useMemo(() => packForDisplay(selected?.ai_pack), [selected?.ai_pack]);

  const analysisReady = useMemo(() => hasMeaningfulAiPack(displayPack), [displayPack]);

  const strategicAiGate = useMemo(
    () =>
      canRunStrategicInnovationAi({
        title,
        summary,
        description,
        domain: projectDomain,
        ws,
      }),
    [title, summary, description, projectDomain, ws]
  );

  const hasCoachTextContext = useMemo(() => {
    const s = summary.trim();
    const d = description.trim();
    const pitch = d || s;
    if (projectDomain === 'startup') {
      return pitch.length >= 48;
    }
    return d.length >= 90 || (s.length >= 28 && d.length >= 48);
  }, [summary, description, projectDomain]);

  const showCoachBlock = Boolean(
    selected && (analysisReady || coachTurns.length > 0 || (!isReadOnly && hasCoachTextContext))
  );

  const coachSuggestedPrompts = useMemo(() => {
    if (projectDomain === 'research') {
      return [
        t('startup.coachResearchPrompt1'),
        t('startup.coachResearchPrompt2'),
        t('startup.coachResearchPrompt3'),
      ];
    }
    return [
      t('startup.coachSuggestedPrompt1'),
      t('startup.coachSuggestedPrompt2'),
      t('startup.coachSuggestedPrompt3'),
      t('startup.coachSuggestedPrompt4'),
      t('startup.coachSuggestedPrompt5'),
    ];
  }, [projectDomain, t]);

  const updateWs = (patch: Partial<WorkspaceFields>) => setWs((prev) => ({ ...prev, ...patch }));

  const twentyCriteriaEvaluation = useMemo(
    () => parseTwentyCriteriaFromAiPack(selected?.ai_pack?.twenty_criteria_evaluation),
    [selected?.ai_pack, selected?.updated_at]
  );

  const startupQuestionnaire = ws.startup_questionnaire ?? EMPTY_STARTUP_QUESTIONNAIRE;

  const handleGenerateStartupQuestionnaire = async () => {
    if (!selected || selected.status === 'submitted' || projectDomain !== 'startup') return;
    if (!analysisReady) {
      setError(t('startup.error.questionnaireNeedsAnalysis'));
      return;
    }
    const ev = evaluateStartupQuestionnaireReadiness({
      title,
      summary,
      description,
      domain: projectDomain,
      ws,
    });
    if (!ev.ok) {
      setError(ev.blockMessages.join('\n\n'));
      return;
    }
    setError(null);
    setQuestionnaireAiLoading(true);
    try {
      const u = getCurrentLocalUser();
      if (!u) throw new Error('not-auth');
      const structuredCore = buildWorkspaceStructuredCore(ws, projectDomain);
      const pitchBody = description.trim() || summary.trim();
      const analysisAugment =
        selected?.ai_pack && hasMeaningfulAiPack(packForDisplay(selected.ai_pack))
          ? `\n\n[AI strategik tahlildan kontekst]\n${analysisExcerptForCoach(selected.ai_pack).slice(0, 14000)}`
          : '';
      const structuredContextNote = [structuredCore, analysisAugment].filter(Boolean).join('\n');
      const items = await fetchStartupDiscoveryQuestionnaire({
        projectTitle: title.trim() || t('startup.defaultProjectTitle'),
        summary: pitchBody.slice(0, 500),
        fullDescription: pitchBody,
        structuredContextNote,
        language: getAppLanguage(),
      });
      const nextQ: StartupQuestionnaireState = { items, answers: {}, generated_at: Date.now() };
      const nextWs: WorkspaceFields = { ...ws, startup_questionnaire: nextQ };
      setWs(nextWs);
      const row = await updateStartupApplication(selected.id, {
        workspace_profile: { ...nextWs } as Record<string, unknown>,
        profile_snapshot: buildStartupProfileSnapshot(u),
      });
      setItems((prev) => prev.map((x) => (x.id === row.id ? row : x)));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      setError(msg || t('startup.error.questionnaireFailed'));
    } finally {
      setQuestionnaireAiLoading(false);
    }
  };

  const handleTwentyCriteriaEvaluate = async () => {
    if (!selected || selected.status === 'submitted' || projectDomain !== 'startup') return;
    setError(null);
    setTwentyEvalLoading(true);
    try {
      const u = getCurrentLocalUser();
      if (!u) throw new Error('not-auth');
      const qBlock = formatQuestionnaireForPrompt(ws.startup_questionnaire ?? EMPTY_STARTUP_QUESTIONNAIRE);
      const pitchBody = description.trim() || summary.trim();
      const result = await fetchStartupTwentyCriteria({
        projectTitle: title.trim() || t('startup.defaultProjectTitle'),
        summary: pitchBody.slice(0, 500),
        fullDescription: pitchBody,
        structuredContextNote: buildWorkspaceStructuredCore(ws, projectDomain),
        questionnaireQaBlock: qBlock,
        language: getAppLanguage(),
      });
      const mergedPack: Record<string, unknown> = {
        ...(selected.ai_pack || {}),
        twenty_criteria_evaluation: result,
      };
      const row = await updateStartupApplication(selected.id, {
        ai_pack: mergedPack,
        workspace_profile: { ...ws } as Record<string, unknown>,
        profile_snapshot: buildStartupProfileSnapshot(u),
      });
      setItems((prev) => prev.map((x) => (x.id === row.id ? row : x)));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      setError(msg || t('startup.error.criteriaFailed'));
    } finally {
      setTwentyEvalLoading(false);
    }
  };

  const handleStartupWordDownload = async () => {
    if (!selected || !twentyCriteriaEvaluation) return;
    setError(null);
    setWordDocLoading(true);
    try {
      const blob = await buildStartupProjectWordBlob({
        projectTitle: title.trim() || t('startup.defaultProjectTitle'),
        summary,
        description,
        questionnaireItems: startupQuestionnaire.items,
        answers: startupQuestionnaire.answers,
        evaluation: twentyCriteriaEvaluation,
      });
      const base =
        (title.trim() || 'loyiha').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 72) || 'loyiha';
      downloadWordBlob(blob, `${base}_startap.docx`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      setError(msg || t('startup.error.wordFailed'));
    } finally {
      setWordDocLoading(false);
    }
  };

  return (
    <div className="w-full space-y-6 px-3 sm:px-5 lg:px-6 pb-20 py-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-violet-600 text-white flex items-center justify-center shadow-md">
            <Rocket size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-black/90">{t('startup.workspaceTitle')}</h1>
            <p className="text-[12px] text-black/50 leading-relaxed max-w-xl">{t('startup.workspaceSubtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => handleNewClick()}
          disabled={saving || loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-md disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
          {t('startup.newProject')}
        </button>
      </div>


      {/* Yangi loyiha turi (joriy tanlov — «Yangi loyiha» shu tipda yaratiladi) */}
      <div className="rounded-2xl border border-black/10 bg-white/70 p-3 sm:p-4 shadow-sm">
        <p className="text-[11px] font-semibold text-black/45 uppercase tracking-wide mb-2">
          {t('startup.projectType')}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setProjectDomain('startup')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold border transition ${
              projectDomain === 'startup'
                ? 'bg-violet-600 text-white border-violet-600 shadow-md'
                : 'bg-white/80 text-black/70 border-black/10 hover:border-violet-300'
            }`}
          >
            <Briefcase size={16} />
            {t('startup.startupProduct')}
          </button>
          <button
            type="button"
            onClick={() => setProjectDomain('research')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold border transition ${
              projectDomain === 'research'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                : 'bg-white/80 text-black/70 border-black/10 hover:border-indigo-300'
            }`}
          >
            <Beaker size={16} />
            {t('startup.researchProject')}
          </button>
        </div>
        <p className="text-[11px] text-black/45 mt-2">
          {t('startup.typeInstructions')}
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-800 whitespace-pre-wrap">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-black/50 gap-2 text-[14px]">
          <Loader2 className="animate-spin" size={20} />
          {t('startup.loading')}
        </div>
      ) : items.length === 0 ? (
        <div className="ios-glass rounded-2xl border border-white/60 p-8 text-center text-[14px] text-black/55 space-y-3">
          <p>{t('startup.noProjectsYet')}</p>
          <p className="text-[13px]">{t('startup.noProjectsHelp')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-black/45 uppercase tracking-wide">{t('startup.myProjects')}</span>
            <select
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              className="rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-[13px] font-medium min-w-[min(100%,420px)] max-w-full"
            >
              {items.map((x) => (
                <option key={x.id} value={x.id}>
                  {formatProjectLabel(x, t('startup.untitledProject'))}
                </option>
              ))}
            </select>
            {selected?.status === 'submitted' && (
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                {t('startup.submittedToAdmin')}
              </span>
            )}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="ios-glass rounded-2xl border border-white/60 p-5 sm:p-6 flex flex-col min-h-0 gap-4"
          >
            <div className="flex flex-wrap items-center gap-2 text-[12px] shrink-0">
              <span className="text-black/45">{t('startup.currentProjectType')}</span>
              <span className="font-bold text-black/85">
                {projectDomain === 'research' ? t('startup.researchTypeLabel') : t('startup.startupTypeLabel')}
              </span>
            </div>

            <div className="space-y-1 shrink-0">
              <label className="text-[11px] font-semibold text-black/50">{t('startup.projectName')}</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isReadOnly}
                className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2.5 text-[14px] outline-none disabled:opacity-60"
                placeholder={t('startup.projectNamePlaceholder')}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 shrink-0">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-black/50">{t('startup.participantType')}</label>
                <select
                  value={participantKind}
                  onChange={(e) => setParticipantKind(e.target.value as 'student' | 'employee')}
                  disabled={isReadOnly}
                  className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2.5 text-[14px] disabled:opacity-60"
                >
                  <option value="student">{t('admin.student')}</option>
                  <option value="employee">{t('admin.employee')}</option>
                </select>
              </div>
            </div>

            {projectDomain === 'research' ? (
              <div className="grid grid-cols-1 gap-3 rounded-2xl border border-indigo-200/60 bg-indigo-50/40 p-4 shrink-0">
                <p className="text-[12px] font-bold text-indigo-900">{t('startup.scientificLayerTitle')}</p>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-black/50">{t('startup.researchQuestion')}</label>
                  <textarea
                    value={ws.research_question}
                    onChange={(e) => updateWs({ research_question: e.target.value })}
                    disabled={isReadOnly}
                    rows={2}
                    className="w-full rounded-xl border border-black/10 bg-white/90 px-3 py-2 text-[14px] disabled:opacity-60"
                    placeholder={t('startup.researchQuestionPlaceholder')}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-black/50">{t('startup.methodology')}</label>
                  <textarea
                    value={ws.methodology_notes}
                    onChange={(e) => updateWs({ methodology_notes: e.target.value })}
                    disabled={isReadOnly}
                    rows={3}
                    className="w-full rounded-xl border border-black/10 bg-white/90 px-3 py-2 text-[14px] disabled:opacity-60"
                    placeholder={t('startup.methodologyPlaceholder')}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-black/50">{t('startup.labEquipment')}</label>
                  <textarea
                    value={ws.partners_lab_equipment}
                    onChange={(e) => updateWs({ partners_lab_equipment: e.target.value })}
                    disabled={isReadOnly}
                    rows={2}
                    className="w-full rounded-xl border border-black/10 bg-white/90 px-3 py-2 text-[14px] disabled:opacity-60"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1 shrink-0">
                <label className="text-[11px] font-semibold text-black/50">{t('startup.projectDescription')}</label>
                <p className="text-[11px] text-black/45 leading-relaxed">{t('startup.projectDescriptionHelp')}</p>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isReadOnly}
                  rows={14}
                  className="w-full rounded-xl border border-black/10 bg-white/90 px-3 py-2.5 text-[14px] outline-none resize-y min-h-[220px] disabled:opacity-60"
                  placeholder={t('startup.projectDescriptionPlaceholder')}
                />
                <p className="text-[11px] text-black/40 tabular-nums">
                  {t('startup.charactersCount', { count: description.trim().length })}
                </p>
              </div>
            )}

            {projectDomain === 'research' && (
              <>
                <div className="space-y-1 shrink-0">
                  <label className="text-[11px] font-semibold text-black/50">{t('startup.teamResources')}</label>
                  <textarea
                    value={ws.key_resources_team}
                    onChange={(e) => updateWs({ key_resources_team: e.target.value })}
                    disabled={isReadOnly}
                    rows={2}
                    className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2.5 text-[14px] outline-none resize-y disabled:opacity-60"
                    placeholder={t('startup.teamResourcesPlaceholder')}
                  />
                </div>
                <div className="space-y-1 shrink-0">
                  <label className="text-[11px] font-semibold text-black/50">{t('startup.briefDescription')}</label>
                  <textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    disabled={isReadOnly}
                    rows={3}
                    className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2.5 text-[14px] outline-none resize-y min-h-[80px] disabled:opacity-60"
                    placeholder={t('startup.briefDescriptionPlaceholder')}
                  />
                </div>
                <div className="space-y-1 shrink-0">
                  <label className="text-[11px] font-semibold text-black/50">{t('startup.detailedDescription')}</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isReadOnly}
                    rows={8}
                    className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2.5 text-[14px] outline-none resize-y min-h-[180px] disabled:opacity-60"
                    placeholder={t('startup.detailedDescriptionPlaceholder')}
                  />
                </div>
              </>
            )}

            {!isReadOnly && projectDomain === 'startup' && (
              <div className="rounded-xl border border-violet-200/80 bg-violet-50/50 px-3 py-2 text-[11px] text-violet-950/90 leading-relaxed">
                {t('startup.stage1Instructions')}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || isReadOnly}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                {t('startup.saveButton')}
              </button>
              <button
                type="button"
                title={strategicAiGate.ok ? t('startup.aiAnalysisTooltip') : strategicAiGate.blockMessages.join(' ')}
                onClick={() => void handleAi()}
                disabled={aiLoading || isReadOnly || !strategicAiGate.ok}
                className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                {t('startup.stage1Analysis')}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-xl border border-black/15 bg-white/90 px-4 py-2.5 text-[13px] font-semibold text-black/80"
              >
                <FileDown size={16} />
                {t('startup.printPdf')}
              </button>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-200 text-rose-700 bg-rose-50 px-4 py-2.5 text-[13px] font-semibold disabled:opacity-50"
                >
                  <Trash2 size={16} />
                  {t('startup.deleteProject')}
                </button>
              )}
            </div>

            <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/60 px-3 py-2.5 text-[12px] text-indigo-950 leading-relaxed">
              {t('startup.submitInstructions')}
            </div>

            {selected && analysisReady && (
              <div className="mt-2 space-y-3">
                <h3 className="text-[14px] font-bold text-black/90 tracking-tight">{t('startup.stage1Title')}</h3>
                <StartupInnovationPackPanel pack={displayPack} />
              </div>
            )}

            {selected && projectDomain === 'startup' && (
              <div className="min-h-0 shrink-0 mt-4">
                <StartupDiscoveryFlow
                  formDisabled={Boolean(isReadOnly)}
                  stage1AnalysisDone={analysisReady}
                  questionnaire={startupQuestionnaire}
                  onQuestionnaireChange={(next) => updateWs({ startup_questionnaire: next })}
                  evaluation={twentyCriteriaEvaluation}
                  generatingQuestions={questionnaireAiLoading}
                  evaluating={twentyEvalLoading}
                  generatingWord={wordDocLoading}
                  onGenerateQuestions={() => void handleGenerateStartupQuestionnaire()}
                  onEvaluate={() => void handleTwentyCriteriaEvaluate()}
                  onDownloadWord={() => void handleStartupWordDownload()}
                />
              </div>
            )}

            {showCoachBlock && (
              <StartupCoachChat
                turns={coachTurns}
                disabled={isReadOnly}
                sending={coachSending}
                onSend={handleCoachSend}
                analysisReady={analysisReady}
                suggestedPrompts={coachSuggestedPrompts}
              />
            )}

            <p className="text-[11px] text-black/40 leading-relaxed">
              {t('startup.aiDisclaimer')}
            </p>
          </motion.div>
        </div>
      )}

      <StartupNewProjectDialog
        open={newProjectOpen}
        domain={projectDomain}
        saving={saving}
        onClose={() => {
          if (!saving) setNewProjectOpen(false);
        }}
        onConfirm={(p) => void handleNewProjectConfirm(p)}
      />

      <div className="sr-only" aria-hidden>
        <div ref={printRef}>
          {selected && (
            <div>
              <h1>{title || t('startup.defaultProjectTitle')}</h1>
              <p>
                <strong>{t('startup.printStatus')}</strong>{' '}
                {selected.status === 'submitted' ? t('startup.statusSubmitted') : t('startup.statusDraft')}
              </p>
              <p>
                <strong>{t('startup.printType')}</strong>{' '}
                {projectDomain === 'research' ? t('startup.researchProject') : t('startup.startupProduct')}
              </p>
              <h2>{t('startup.printSummary')}</h2>
              <p style={{ whiteSpace: 'pre-wrap' }}>{summary}</p>
              <h2>{t('startup.printProjectText')}</h2>
              <p style={{ whiteSpace: 'pre-wrap' }}>
                {projectDomain === 'startup' ? description.trim() || summary : description}
              </p>
              {hasMeaningfulAiPack(packForDisplay(selected.ai_pack)) ? (
                <div
                  dangerouslySetInnerHTML={{
                    __html: buildStartupPackPrintInnerHtml(packForDisplay(selected.ai_pack)),
                  }}
                />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
