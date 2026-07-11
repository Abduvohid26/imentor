"""Prompts and schema configs for startup AI endpoints (mirror frontend aiService startup flows)."""

from __future__ import annotations

TWENTY_CRITERIA_BLOCK = """c01: Muammo aniqligi va mijoz segmenti
c02: Yechimning tibbiy / ijtimoiy ta'siri
c03: Innovatsiya va farqlanish
c04: Bozor ehtiyoji va dolzarblik
c05: Raqobat va pozitsiyalash
c06: Monetizatsiya va barqarorlik modeli
c07: Traksiya yoki dalillar (pilot, suhbat, raqam)
c08: Jamoa va asosiy kompetensiyalar
c09: Texnologiya / mahsulot tayyorgarligi
c10: Regulyatorika va tibbiy xavfsizlik
c11: Shaxsiy ma'lumot va maxfiylik
c12: Klinik yoki amaliyot integratsiyasi
c13: Pilot dizayn va KPI
c14: Xavflar va yumshatish rejasi
c15: Grant / moliya manbalari mosligi
c16: Institut / kampus kontekstiga moslik
c17: Pitch va tushunarli komunikatsiya
c18: Yo'l xaritasi (30/90 kun)
c19: Hujjatlar va jarayon tartibi
c20: Barqaror kengaytirish (masshtab) imkoniyati"""

QUESTIONNAIRE_RESPONSE_SCHEMA: dict = {
    "type": "OBJECT",
    "properties": {
        "items": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "id": {"type": "STRING"},
                    "question": {"type": "STRING"},
                    "hint": {"type": "STRING"},
                },
                "required": ["id", "question"],
            },
        }
    },
    "required": ["items"],
}

TWENTY_CRITERIA_RESPONSE_SCHEMA: dict = {
    "type": "OBJECT",
    "properties": {
        "criteria": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "id": {"type": "STRING"},
                    "score_1_to_5": {"type": "NUMBER"},
                    "comment": {"type": "STRING"},
                },
                "required": ["id", "score_1_to_5", "comment"],
            },
        },
        "overall_0_100": {"type": "NUMBER"},
        "ready_for_market": {"type": "BOOLEAN"},
        "verdict_uz": {"type": "STRING"},
    },
    "required": ["criteria", "overall_0_100", "ready_for_market", "verdict_uz"],
}


def language_name(code: str) -> str:
    c = (code or "uz").strip().lower()
    if c == "ru":
        return "Russian"
    if c == "en":
        return "English"
    return "Uzbek"


def questionnaire_user_prompt(
    *,
    project_title: str,
    summary: str,
    full_description: str,
    structured_context_note: str,
    out_lang: str,
) -> str:
    note = structured_context_note.strip() if structured_context_note else "(none)"
    return f"""You help Uzbekistan medical / public-health institute students and staff clarify a startup idea.

Project title: {project_title}
Summary: {summary}
Full description:
{full_description}

Extra structured notes (may be empty):
{note}

Generate EXACTLY between 20 and 25 discovery questions in {out_lang} (target 22). These deepen understanding AFTER the founder pitch — cover gaps the pitch leaves open: problem/customer, solution fit, clinical/regulatory, data/privacy, pilot/KPI, team, economics/GTM, risks, Uzbekistan/institute context.
Questions must be specific to THIS project (reference problem, user, setting, constraints from the text). Avoid duplicate angles.
Each item: id (stable unique snake_case, e.g. q_problem_segment), question (max 3 short sentences), hint optional (one short phrase).

Return JSON only."""


def twenty_criteria_user_prompt(
    *,
    project_title: str,
    summary: str,
    full_description: str,
    structured_context_note: str,
    questionnaire_qa_block: str,
    out_lang: str,
) -> str:
    note = structured_context_note.strip() if structured_context_note else "(none)"
    qa = questionnaire_qa_block.strip()
    if not qa:
        qa = "(Questionnaire answers missing — score conservatively and mention gaps.)"
    return f"""You are a rigorous startup evaluator for medical / digital health / public health ventures in Uzbekistan (institute context: students and staff).

Evaluate the project using EXACTLY these 20 criteria (ids c01 through c20):
{TWENTY_CRITERIA_BLOCK}

Project title: {project_title}
Summary: {summary}
Description:
{full_description}

Structured notes:
{note}

{qa}

Rules:
- For EACH of c01..c20 output score_1_to_5 (integer 1-5) and a concise comment in {out_lang} tied to evidence in the text; if information is missing, say what is missing and score lower.
- overall_0_100: integer 0-100 aligned with the 20 scores (strict for vague ideas).
- ready_for_market: true ONLY if the text shows clear problem-solution direction, plausible validation path, and realistic next steps; for vague "idea only" or purely wishful text, ready_for_market must be false.
- verdict_uz: 2-4 sentences in {out_lang}.

Return JSON only."""


def innovation_pack_user_prompt(
    *,
    project_title: str,
    summary: str,
    full_description: str,
    profile_note: str,
    workspace_extra_note: str,
    out_lang: str,
    project_domain: str,
) -> str:
    domain_line = (
        "USER MODE: ILMIY TADQIROT — prioritize scientific_research_block, evidence, methodology, peer comparisons; keep market sections concise unless clearly translational."
        if project_domain == "research"
        else """USER MODE: STARTAP / MAHSULOT — You are writing for a serious founder team (not a student essay). Prioritize market_analysis, traction_readiness, competitive_landscape, investor_style_outline, milestone_roadmap, risk_register.
Ground every section in the user's actual text; when information is missing, name the gap and the cheapest experiment or interview to close it (do not invent metrics, pilots, or partners).
In competitive_landscape, compare to plausible categories, regional analogs, or well-known product archetypes when reasonable; if unknown, state what desk research or 5–10 customer interviews should clarify.
In milestone_roadmap items, prefer concrete verbs + outcomes (e.g. "10 ta strukturali suhbat + 1 sahifalik natija xulosasi") over vague "rivojlantirish".
In critical_gaps and what_would_raise_readiness_fastest, be blunt and actionable (what to stop doing, what to validate first).
scientific_research_block stays shorter unless the project is clearly R&D-heavy."""
    )
    extra_block = (
        f"\nAdditional structured notes from applicant:\n{workspace_extra_note.strip()}\n"
        if workspace_extra_note.strip()
        else ""
    )
    return f"""You are a senior innovation analyst, medical-education grant advisor, and hands-on early-stage startup mentor (accelerator / venture builder style) for Farg'ona jamoat salomatligi tibbiyot instituti (public health / medical higher education, Uzbekistan). Your reader will use your output to decide what to do next week — not to feel praised.

{domain_line}

Inputs:
- Title: {project_title}
- Short summary: {summary}
- Full description: {full_description}
- Applicant / lab context: {profile_note}
{extra_block}
Task: produce a RICH, structured analysis. Ban template phrases that could apply to any health startup (e.g. empty "katta bozor", "innovatsion yechim" without tying to this idea). Every major bullet should reference the user's problem, customer, setting, or constraint when possible.

Return ONLY valid JSON (no markdown) with EXACTLY these keys. All human-readable text must be in {out_lang}. Use numbers where specified. Be specific to THIS project.

Tone: direct, founder-friendly, institution-aware (grants, ethics, pilots on campus or clinical partners).

{{
  "project_archetype": "commercial_startup" | "research_innovation" | "hybrid",
  "archetype_rationale": "string (2-4 jumla)",

  "one_line_positioning": "string (1 qatorlik pitch)",
  "value_proposition": "string (foydalanuvchi va natija)",

  "market_analysis": {{
    "serviceable_context": "string (qaysi bozor / segment, O'zbekiston va institut kontekstida)",
    "customer_and_payer_segments": ["string", "..."],
    "market_trends_relevant": ["string", "..."],
    "market_sizing_notes": "string (TAM/SAM/SOM yoki kvalitativ baho — ixtiyoriy, lekin halol)",
    "go_to_market_hooks": ["string", "..."]
  }},

  "competitive_landscape": [
    {{
      "name_or_category": "string",
      "similarity_score_1_to_5": 1,
      "how_similar_or_different": "string",
      "strategic_takeaway": "string"
    }}
  ],

  "differentiation_and_moat": "string",

  "traction_readiness": {{
    "estimated_stage": "idea | discovery | prototype | pilot | early_revenue | scale",
    "readiness_score_1_to_100": 50,
    "score_breakdown": ["string (har bir 8-15 so'z)", "..."],
    "strongest_evidence_in_text": ["string", "..."],
    "critical_gaps": ["string", "..."],
    "what_would_raise_readiness_fastest": ["string", "..."]
  }},

  "scientific_research_block": {{
    "is_research_central": true,
    "research_question": "string yoki noma'lum agar startap bo'lsa",
    "hypothesis_or_innovation_claim": "string",
    "evidence_user_already_has": "string",
    "evidence_still_needed": "string",
    "methodology_completeness": "string (laboratoriya, klinik, simulyatsiya, statistika...)",
    "peer_review_comparables": "string (o'xshash ishlar, nima yangi?)",
    "how_to_strengthen_proof": ["string", "..."]
  }},

  "fjsti_institutional_fit": "string (institut vazifalari, kafedra, salomatlik/TA bo'yicha moslik)",

  "ethics_clinical_regulatory_note": "string (tibbiy, shaxsiy ma'lumot, klinik sinov, xavfsizlik — qisqa)",

  "team_and_execution": {{
    "roles_to_fill": [
      {{ "role": "string", "why": "string", "suggested_profile": "string" }}
    ],
    "advisor_mentor_suggestions": ["string", "..."]
  }},

  "milestone_roadmap": {{
    "next_30_days": ["string", "..."],
    "next_90_days": ["string", "..."],
    "next_12_months": ["string", "..."],
    "key_milestones": [
      {{ "title": "string", "success_metric": "string", "dependency_risk": "string" }}
    ]
  }},

  "grant_and_partnership_fit": {{
    "likely_grant_or_program_types": ["string", "..."],
    "evidence_package_to_prepare": ["string", "..."]
  }},

  "investor_style_outline": {{
    "problem_hook": "string",
    "solution_and_why_now": "string",
    "business_model_sketch": "string",
    "impact_metrics": ["string", "..."],
    "the_ask": "string (nimani so'rash: grant, pilot, laboratoriya vaqt...)"
  }},

  "scoring_matrix": [
    {{ "criterion": "string", "weight_1_to_5": 4, "project_score_1_to_5": 3, "comment": "string" }}
  ],

  "risk_register": [
    {{ "risk": "string", "likelihood_1_to_5": 3, "impact_1_to_5": 4, "mitigation": "string" }}
  ],

  "recommended_documents": [
    {{ "document": "string", "purpose": "string", "must_include_sections": ["string", "..."] }}
  ],

  "disclaimer_note": "string (maslahat xarakteri, rasmiy tasdiq emas)"
}}

Rules:
- Fill arrays with 3-8 items where relevant (not empty unless truly unknown).
- similarity_score / readiness / likelihood / impact must be integers in range.
- No legal guarantees; no fabricated citations — if unknown, say what data to collect.
- Keep Uzbekistan public-health institute realism; investor_style_outline may assume pre-seed / grant / pilot stage unless the text clearly indicates otherwise.
- recommended_documents must name deliverables the team can actually produce in 2–8 weeks (e.g. one-pager, interview guide, pilot protocol sketch), not only generic "biznes-reja"."""


def coach_user_prompt(
    *,
    messages: list[dict[str, str]],
    project_domain: str,
    title: str,
    summary: str,
    description: str,
    workspace_profile_json: str,
    analysis_json_excerpt: str,
    out_lang: str,
) -> str:
    transcript = "\n".join(
        f"{'User' if (m.get('role') or '').strip().lower() == 'user' else 'Assistant'}: {m.get('content', '')}"
        for m in messages
    )
    mode_coach = (
        "Scientific research / R&D — emphasize evidence, methods, publications or study design, ethics."
        if project_domain == "research"
        else 'Startup / product — you behave like an operator-mentor: weekly priorities, validation experiments, metrics to watch, pitch tightening, and de-risking. Prefer "do this / measure this / decide this" over general encouragement.'
    )
    return f"""You are the FJSTI innovation mentor assistant (medical higher education / public health institute, Uzbekistan).

{mode_coach}

Project mode detail: {"research" if project_domain == "research" else "startup"}.
Title: {title}
Summary: {summary}
Description: {description}
Workspace profile (JSON): {workspace_profile_json}

Earlier structured analysis (JSON excerpt, may be truncated or empty if the user has not run full analysis yet — still answer from title/summary/description/workspace):
{analysis_json_excerpt}

Conversation so far:
{transcript}

Reply ONLY as the Assistant to the latest User message. Be specific, practical, and concise. Use short bullet lists when they improve clarity. Output language: {out_lang}. Do not dump or repeat the full JSON analysis unless the user explicitly asks. If the question is broad, still end with 2–4 concrete next steps tied to this project. If asked something outside project scope, briefly redirect to actionable next steps for this project."""
