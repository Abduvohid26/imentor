import type { StartupApplicationDto } from './startupApplicationApi';

/** StartupWorkspace bilan mos — siklni oldini olish uchun alohida */
export type WorkspaceFieldsLike = {
  research_question?: string;
  methodology_notes?: string;
  beneficiaries_or_segments?: string;
  monetization_or_sustainability?: string;
  key_resources_team?: string;
  partners_lab_equipment?: string;
  traction_validation_notes?: string;
  biggest_uncertainty?: string;
};

export type DossierTeamRowLike = {
  full_name: string;
  role: string;
  organization: string;
  contact: string;
};

const DEFAULT_TITLES = new Set(['yangi startap loyiha', 'yangi ilmiy loyiha', 'loyihasiz']);

export type ReadinessItem = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

function normTitle(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** AI tahlil natijasi “bo‘sh” emasligini tekshiradi (faqat disclaimer yoki xatolik emas). */
export function hasMeaningfulAiPack(pack: Record<string, unknown> | undefined | null): boolean {
  if (!pack || typeof pack !== 'object') return false;
  const keys = Object.keys(pack).filter((k) => k !== 'coach_thread');
  if (keys.length === 0) return false;
  const markers = [
    'market_analysis',
    'traction_readiness',
    'value_proposition',
    'one_line_positioning',
    'competitive_landscape',
    'milestone_roadmap',
    'scoring_matrix',
  ];
  for (const k of markers) {
    const v = pack[k];
    if (v == null) continue;
    if (typeof v === 'string' && v.trim().length > 12) return true;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length > 0) return true;
    if (Array.isArray(v) && v.length > 0) return true;
  }
  return false;
}

export type WorkspaceFormInput = {
  title: string;
  summary: string;
  description: string;
  domain: 'startup' | 'research';
  ws: WorkspaceFieldsLike;
};

/**
 * Loyiha kartasi to‘ldirilganligi va AI tahlil uchun minimal sifat.
 */
export function evaluateWorkspaceForAi(input: WorkspaceFormInput): {
  percent: number;
  items: ReadinessItem[];
  canRunAi: boolean;
  blockMessages: string[];
} {
  const t = input.title.trim();
  const s = input.summary.trim();
  const d = input.description.trim();
  const items: ReadinessItem[] = [];
  const blockMessages: string[] = [];

  const titleOk = t.length >= 4 && !DEFAULT_TITLES.has(normTitle(t));
  items.push({
    id: 'title',
    label: 'Loyiha nomi',
    ok: titleOk,
    detail: titleOk ? 'Yaxshi' : 'Kamida 4 belgi; standart “Yangi … loyiha” nomini o‘zgartiring',
  });
  if (!titleOk) blockMessages.push('Loyiha nomi aniq va maxsus bo‘lishi kerak (standart sarlavhani o‘zgartiring).');

  const summaryOk = s.length >= 48;
  items.push({
    id: 'summary',
    label: 'Qisqa tavsif',
    ok: summaryOk,
    detail: summaryOk ? 'Yaxshi' : `Kamida ~48 belgi (hozir ${s.length}). Maqsad va ahamiyatni qisqa yozing`,
  });
  if (!summaryOk) blockMessages.push('Qisqa tavsifni kengaytiring — maqsad va ijtimoiy/tibbiy ahamiyat.');

  const descOk = d.length >= 220;
  items.push({
    id: 'description',
    label: 'Batafsil tavsif',
    ok: descOk,
    detail: descOk ? 'Yaxshi' : `Kamida ~220 belgi (hozir ${d.length}). Muammo, yechim, reja, cheklovlar`,
  });
  if (!descOk) blockMessages.push('Batafsil tavsifni boyitiring — muammo, yechim, innovatsiya, keyingi qadamlar.');

  let domainPoints = 0;

  if (input.domain === 'research') {
    const rq = (input.ws.research_question ?? '').trim().length >= 36;
    const mn = (input.ws.methodology_notes ?? '').trim().length >= 50;
    const pl = (input.ws.partners_lab_equipment ?? '').trim().length >= 20;
    items.push({
      id: 'rq',
      label: 'Tadqiqot savoli / gipoteza',
      ok: rq,
      detail: rq ? 'Yaxshi' : 'Kamida ~36 belgi',
    });
    items.push({
      id: 'meth',
      label: 'Metodologiya',
      ok: mn,
      detail: mn ? 'Yaxshi' : 'Kamida ~50 belgi',
    });
    items.push({
      id: 'lab',
      label: 'Laboratoriya / hamkorlar',
      ok: pl,
      detail: pl ? 'Yaxshi' : 'Qisqacha ham yozing',
    });
    if (!rq) blockMessages.push('Ilmiy savol yoki gipotezani aniqroq yozing.');
    if (!mn) blockMessages.push('Metodologiya va dizayn maydonini to‘ldiring.');
  } else {
    const ben = (input.ws.beneficiaries_or_segments ?? '').trim().length >= 28;
    const mon = (input.ws.monetization_or_sustainability ?? '').trim().length >= 24;
    const tr = (input.ws.traction_validation_notes ?? '').trim().length >= 20;
    const un = (input.ws.biggest_uncertainty ?? '').trim().length >= 20;
    const team = (input.ws.key_resources_team ?? '').trim().length >= 24;
    if (ben) domainPoints++;
    if (mon) domainPoints++;
    if (tr) domainPoints++;
    if (un) domainPoints++;
    if (team) domainPoints++;
    items.push({
      id: 'ben',
      label: 'Maqsadli mijoz / segment',
      ok: ben,
      detail: ben ? 'Yaxshi' : 'Kamida ~28 belgi',
    });
    items.push({
      id: 'mon',
      label: 'Monetizatsiya / barqarorlik',
      ok: mon,
      detail: mon ? 'Yaxshi' : 'Kamida ~24 belgi',
    });
    items.push({
      id: 'tr',
      label: 'Traksiya va tekshiruv',
      ok: tr,
      detail: tr ? 'Yaxshi' : 'Hozirgi holat (hatto “hali yo‘q”) — qisqacha',
    });
    items.push({
      id: 'un',
      label: 'Eng katta noaniqlik',
      ok: un,
      detail: un ? 'Yaxshi' : 'Kamida ~20 belgi',
    });
    items.push({
      id: 'team',
      label: 'Jamoa va resurslar',
      ok: team,
      detail: team ? 'Yaxshi' : 'Kim bor, nima yetishmaydi',
    });
    const domainOk = domainPoints >= 4;
    if (!domainOk) {
      blockMessages.push(
        'Startap qatlami: maqsadli mijoz, monetizatsiya, traksiya, noaniqlik va jamoa maydonlaridan kamida 4 tasini to‘liqroq to‘ldiring.'
      );
    }
  }

  const coreOk = titleOk && summaryOk && descOk;
  let domainOk = false;
  if (input.domain === 'research') {
    domainOk =
      (input.ws.research_question ?? '').trim().length >= 36 &&
      (input.ws.methodology_notes ?? '').trim().length >= 50;
  } else {
    let c = 0;
    if ((input.ws.beneficiaries_or_segments ?? '').trim().length >= 28) c++;
    if ((input.ws.monetization_or_sustainability ?? '').trim().length >= 24) c++;
    if ((input.ws.traction_validation_notes ?? '').trim().length >= 20) c++;
    if ((input.ws.biggest_uncertainty ?? '').trim().length >= 20) c++;
    if ((input.ws.key_resources_team ?? '').trim().length >= 24) c++;
    domainOk = c >= 4;
  }

  const canRunAi = coreOk && domainOk;

  const passed = items.filter((x) => x.ok).length;
  const percent = Math.min(100, Math.round((passed / Math.max(1, items.length)) * 100));

  return { percent, items, canRunAi, blockMessages };
}

/** Matritsa: og‘irlik bilan o‘rtacha ball (1–5) va 0–100 shkala. */
export function computeWeightedScoringMatrix(
  rows: Record<string, unknown>[]
): { weightedAvg1to5: number | null; percent100: number | null; rowCount: number } {
  let sumW = 0;
  let sumWS = 0;
  let n = 0;
  for (const row of rows) {
    const wRaw = row.weight_1_to_5 ?? row.weight;
    const sRaw = row.project_score_1_to_5 ?? row.score_1_to_5 ?? row.score;
    const w = typeof wRaw === 'number' && Number.isFinite(wRaw) ? Math.min(5, Math.max(1, wRaw)) : null;
    const sc = typeof sRaw === 'number' && Number.isFinite(sRaw) ? Math.min(5, Math.max(1, sRaw)) : null;
    if (w != null && sc != null) {
      sumW += w;
      sumWS += w * sc;
      n++;
    }
  }
  if (n === 0 || sumW <= 0) return { weightedAvg1to5: null, percent100: null, rowCount: rows.length };
  const weightedAvg1to5 = sumWS / sumW;
  const percent100 = Math.round(((weightedAvg1to5 - 1) / 4) * 100);
  return { weightedAvg1to5, percent100, rowCount: n };
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pBlock(label: string, text: string): string {
  if (!text.trim()) return '';
  return `<h2>${esc(label)}</h2><p style="white-space:pre-wrap">${esc(text)}</p>`;
}

function ulFromStrings(items: string[]): string {
  if (!items.length) return '';
  return `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
}

/**
 * Chop etish / PDF uchun JSON devorini emas, tuzilgan HTML.
 */
export function buildStartupPackPrintInnerHtml(pack: Record<string, unknown>): string {
  const parts: string[] = [];
  const one =
    (typeof pack.one_line_positioning === 'string' && pack.one_line_positioning) ||
    (typeof pack.elevator_pitch === 'string' && pack.elevator_pitch) ||
    '';
  const vp =
    (typeof pack.value_proposition === 'string' && pack.value_proposition) ||
    (typeof pack.problem_and_solution === 'string' && pack.problem_and_solution) ||
    '';
  parts.push(pBlock('Bir qatorlik', one));
  parts.push(pBlock('Qiymat taklifi', vp));

  const market = pack.market_analysis;
  if (market && typeof market === 'object' && !Array.isArray(market)) {
    const m = market as Record<string, unknown>;
    const ctx = typeof m.serviceable_context === 'string' ? m.serviceable_context : '';
    parts.push(pBlock('Bozor konteksti', ctx));
  }

  const tract = pack.traction_readiness;
  if (tract && typeof tract === 'object' && !Array.isArray(tract)) {
    const tr = tract as Record<string, unknown>;
    const stage = typeof tr.estimated_stage === 'string' ? tr.estimated_stage : '';
    const score = typeof tr.readiness_score_1_to_100 === 'number' ? String(tr.readiness_score_1_to_100) : '';
    parts.push(
      `<h2>Tayyorgarlik</h2><p>${esc([stage && `Bosqich: ${stage}`, score && `Ball: ${score}/100`].filter(Boolean).join(' · '))}</p>`
    );
    if (Array.isArray(tr.critical_gaps)) {
      parts.push(`<h3>Muhim bo‘shliqlar</h3>${ulFromStrings((tr.critical_gaps as unknown[]).map(String))}`);
    }
  }

  const scores = pack.scoring_matrix;
  if (Array.isArray(scores) && scores.length > 0) {
    const { weightedAvg1to5, percent100 } = computeWeightedScoringMatrix(scores as Record<string, unknown>[]);
    const head =
      weightedAvg1to5 != null
        ? `<p><strong>Og‘irlik bilan o‘rtacha:</strong> ${weightedAvg1to5.toFixed(2)} / 5 (${percent100}%)</p>`
        : '';
    const rows = (scores as Record<string, unknown>[])
      .map(
        (r) =>
          `<tr><td>${esc(String(r.criterion ?? ''))}</td><td style="text-align:center">${esc(String(r.weight_1_to_5 ?? '—'))}</td><td style="text-align:center">${esc(String(r.project_score_1_to_5 ?? r.score_1_to_5 ?? '—'))}</td><td>${esc(String(r.comment ?? r.rationale ?? ''))}</td></tr>`
      )
      .join('');
    parts.push(
      `<h2>Baholash matritsasi</h2>${head}<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr><th>Mezon</th><th>Og‘irlik</th><th>Ball</th><th>Izoh</th></tr></thead><tbody>${rows}</tbody></table>`
    );
  }

  const risks = pack.risk_register;
  if (Array.isArray(risks) && risks.length > 0) {
    const rows = (risks as Record<string, unknown>[])
      .map(
        (r) =>
          `<tr><td>${esc(String(r.risk ?? ''))}</td><td style="text-align:center">${esc(String(r.likelihood_1_to_5 ?? '—'))}</td><td style="text-align:center">${esc(String(r.impact_1_to_5 ?? '—'))}</td><td>${esc(String(r.mitigation ?? ''))}</td></tr>`
      )
      .join('');
    parts.push(
      `<h2>Xavflar</h2><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr><th>Xavf</th><th>Ehtimollik</th><th>Ta’sir</th><th>Yumshatish</th></tr></thead><tbody>${rows}</tbody></table>`
    );
  }

  const disc = typeof pack.disclaimer_note === 'string' ? pack.disclaimer_note : '';
  parts.push(pBlock('Eslatma', disc));

  return parts.filter(Boolean).join('\n') || '<p><em>Tahlil bo‘laklari chop etish uchun yetarli emas.</em></p>';
}

export type DossierSubmitInput = {
  application: StartupApplicationDto;
  vcOneLiner: string;
  team: DossierTeamRowLike[];
};

export function evaluateDossierForSubmit(input: DossierSubmitInput): {
  ok: boolean;
  messages: string[];
  warnings: string[];
} {
  const messages: string[] = [];
  const warnings: string[] = [];
  const { application, vcOneLiner, team } = input;
  const title = (application.title ?? '').trim();
  const summary = (application.summary ?? '').trim();
  const description = (application.description ?? '').trim();

  if (title.length < 4 || DEFAULT_TITLES.has(normTitle(title))) {
    messages.push('«Startap studiyasida» loyiha nomini maxsus va mazmunli qiling.');
  }
  if (summary.length < 40) {
    messages.push('Loyiha qisqa tavsifi juda qisqa — studiyada kengaytiring (kamida ~40 belgi).');
  }
  if (description.length < 200) {
    messages.push('Batafsil tavsif kamida ~200 belgi bo‘lishi kerak — studiyada to‘ldiring.');
  }

  const pitch = vcOneLiner.trim();
  if (pitch.length < 24) {
    messages.push('Elevator / bir qatorlik pitch kamida ~24 belgi bo‘lsin.');
  }

  const validTeam = team.filter(
    (m) =>
      m.full_name.trim().length >= 3 &&
      m.role.trim().length >= 2 &&
      (m.contact.trim().length >= 5 || m.organization.trim().length >= 3)
  );
  if (validTeam.length < 1) {
    messages.push('Kamida bitta jamoa a’zosi: F.I.Sh., rol va aloqa yoki tashkilot to‘ldirilishi shart.');
  }

  const pack = application.ai_pack;
  const display: Record<string, unknown> = { ...(pack || {}) };
  delete display.coach_thread;
  if (!hasMeaningfulAiPack(display)) {
    warnings.push(
      'Hozircha to‘liq AI tahlil yo‘q — «Startap studiyasida» «AI tahlil»ni ishga tushirib, keyin yuborish tavsiya etiladi.'
    );
  }

  return { ok: messages.length === 0, messages, warnings };
}

/**
 * Startap: savolnoma generatsiyasi uchun minimal talab — faqat nom + qisqa “pitch” (summary va/yoki batafsil).
 * To‘liq AI strategik tahlil uchun `evaluateWorkspaceForAi` qat’iyroq.
 */
export function evaluateStartupQuestionnaireReadiness(input: WorkspaceFormInput): {
  ok: boolean;
  blockMessages: string[];
} {
  const t = input.title.trim();
  const s = input.summary.trim();
  const d = input.description.trim();
  const titleOk = t.length >= 4 && !DEFAULT_TITLES.has(normTitle(t));
  /** Batafsil ustuvor; bo‘sh bo‘lsa qisqa tavsif (eski ma’lumotlar bilan mos). */
  const pitch = (d || s).trim();
  const pitchOk = pitch.length >= 60;
  const blockMessages: string[] = [];
  if (!titleOk) {
    blockMessages.push('Loyiha nomi: kamida 4 belgi va maxsus nom (standart «Yangi … loyiha» bo‘lmasin).');
  }
  if (!pitchOk) {
    blockMessages.push(
      '«Loyiha haqida» maydoni kamida ~60 belgi bo‘lsin — g‘oya, muammo, yechim, kim uchun (qisqa yoki batafsil).'
    );
  }
  return { ok: titleOk && pitchOk, blockMessages };
}

/** Strategik «AI tahlil» tugmasi: startapda savolnoma bilan bir xil yumshoq shart; tadqiqotda to‘liq tayyorgarlik. */
export function canRunStrategicInnovationAi(input: WorkspaceFormInput): {
  ok: boolean;
  blockMessages: string[];
} {
  if (input.domain === 'startup') {
    return evaluateStartupQuestionnaireReadiness(input);
  }
  const r = evaluateWorkspaceForAi(input);
  return { ok: r.canRunAi, blockMessages: r.blockMessages };
}
