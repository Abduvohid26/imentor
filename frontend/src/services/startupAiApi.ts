import { HttpError, httpJson } from '../api/httpClient';
import { getBackendAccessToken } from '../utils/backendAuth';
import type { AppLanguage } from '../i18n/language';
import type {
  QuestionnaireItem,
  StartupDiscoveryQuestionnaireAi,
  TwentyCriteriaEvaluation,
} from '../utils/startupEvaluationTypes';
import { normalizeTwentyCriteriaEvaluation } from '../utils/normalizeTwentyCriteriaResult';
import { normalizeQuestionnaireItemsFromAi } from '../utils/normalizeStartupQuestionnaire';

const AI_TIMEOUT_MS = 180_000;

function apiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.VITE_API_BASE_URL?.trim() || '/api';
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getBackendAccessToken();
  if (!token) throw new Error('no-backend-token');
  return { Authorization: `Bearer ${token}` };
}

function detailFromHttpError(e: HttpError): string {
  const b = e.body;
  if (b && typeof b === 'object' && 'detail' in b && typeof (b as { detail: unknown }).detail === 'string') {
    return (b as { detail: string }).detail;
  }
  return e.message;
}

export async function fetchStartupDiscoveryQuestionnaire(params: {
  projectTitle: string;
  summary: string;
  fullDescription: string;
  structuredContextNote: string;
  language: AppLanguage;
}): Promise<QuestionnaireItem[]> {
  let raw: StartupDiscoveryQuestionnaireAi;
  try {
    raw = await httpJson<StartupDiscoveryQuestionnaireAi>(`${apiBaseUrl()}/v1/startup-ai/questionnaire/`, {
      method: 'POST',
      headers: await authHeaders(),
      body: {
        project_title: params.projectTitle,
        summary: params.summary,
        full_description: params.fullDescription,
        structured_context_note: params.structuredContextNote,
        language: params.language,
      },
      timeoutMs: AI_TIMEOUT_MS,
    });
  } catch (e: unknown) {
    if (e instanceof HttpError) throw new Error(detailFromHttpError(e));
    throw e;
  }
  const items = normalizeQuestionnaireItemsFromAi(raw);
  if (items.length < 18) {
    throw new Error(
      "Savolnoma yetarli emas (kamida ~18 savol kutiladi). AI tahlilni yangilab yoki loyiha matnini kengaytiring va qayta «2-bosqich: savollar»ni bosing."
    );
  }
  return items;
}

export async function fetchStartupTwentyCriteria(params: {
  projectTitle: string;
  summary: string;
  fullDescription: string;
  structuredContextNote: string;
  questionnaireQaBlock: string;
  language: AppLanguage;
}): Promise<TwentyCriteriaEvaluation> {
  let parsed: {
    criteria: Array<{ id: string; score_1_to_5: number; comment: string }>;
    overall_0_100: number;
    ready_for_market: boolean;
    verdict_uz: string;
  };
  try {
    parsed = await httpJson<typeof parsed>(`${apiBaseUrl()}/v1/startup-ai/twenty-criteria/`, {
      method: 'POST',
      headers: await authHeaders(),
      body: {
        project_title: params.projectTitle,
        summary: params.summary,
        full_description: params.fullDescription,
        structured_context_note: params.structuredContextNote,
        questionnaire_qa_block: params.questionnaireQaBlock,
        language: params.language,
      },
      timeoutMs: AI_TIMEOUT_MS,
    });
  } catch (e: unknown) {
    if (e instanceof HttpError) throw new Error(detailFromHttpError(e));
    throw e;
  }
  return normalizeTwentyCriteriaEvaluation(parsed);
}

export async function fetchStartupInnovationPack(
  projectTitle: string,
  summary: string,
  fullDescription: string,
  profileNote: string,
  language: AppLanguage,
  projectDomain: 'startup' | 'research',
  workspaceExtraNote: string
): Promise<Record<string, unknown>> {
  try {
    return await httpJson<Record<string, unknown>>(`${apiBaseUrl()}/v1/startup-ai/innovation-pack/`, {
      method: 'POST',
      headers: await authHeaders(),
      body: {
        project_title: projectTitle,
        summary,
        full_description: fullDescription,
        profile_note: profileNote,
        language,
        project_domain: projectDomain,
        workspace_extra_note: workspaceExtraNote,
      },
      timeoutMs: AI_TIMEOUT_MS,
    });
  } catch (e: unknown) {
    if (e instanceof HttpError) throw new Error(detailFromHttpError(e));
    throw e;
  }
}

export async function fetchStartupInnovationCoachReply(
  messages: { role: 'user' | 'assistant'; content: string }[],
  ctx: {
    project_domain: 'startup' | 'research';
    title: string;
    summary: string;
    description: string;
    workspace_profile_json: string;
    analysis_json_excerpt: string;
  },
  language: AppLanguage
): Promise<string> {
  try {
    const res = await httpJson<{ reply: string }>(`${apiBaseUrl()}/v1/startup-ai/coach-reply/`, {
      method: 'POST',
      headers: await authHeaders(),
      body: { messages, ctx, language },
      timeoutMs: AI_TIMEOUT_MS,
    });
    const text = res.reply?.trim();
    if (!text) throw new Error('Empty coach reply');
    return text;
  } catch (e: unknown) {
    if (e instanceof HttpError) throw new Error(detailFromHttpError(e));
    throw e;
  }
}
