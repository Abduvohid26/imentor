from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, require_roles
from app.core.config import get_settings
from app.core.db import get_db
from app.schemas.startup_ai import (
    CoachReplyRequest,
    CoachReplyResponse,
    InnovationPackRequest,
    QuestionnaireRequest,
    TwentyCriteriaRequest,
)
from app.services import openai_client as oai
from app.services import startup_ai_prompts as prompts
from app.services.json_loose import parse_json_loose

router = APIRouter()

_MAX_TEXT_FIELD = 120_000


def _clip(s: str, max_len: int = _MAX_TEXT_FIELD) -> str:
    return (s or "").strip()[:max_len]


def _require_api_key() -> str:
    settings = get_settings()
    api_key = settings.openai_api_key.strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY serverda sozlanmagan.")
    return api_key


@router.post("/startup-ai/questionnaire/")
def startup_ai_questionnaire(
    payload: QuestionnaireRequest,
    auth: AuthContext = Depends(require_roles("startuper", "admin")),
) -> dict:
    api_key = _require_api_key()
    project_title = _clip(payload.project_title, 500)
    full_description = _clip(payload.full_description)
    if not project_title and not full_description:
        raise HTTPException(status_code=400, detail="project_title yoki full_description kerak.")

    user_text = prompts.questionnaire_user_prompt(
        project_title=project_title or "Loyiha",
        summary=_clip(payload.summary),
        full_description=full_description,
        structured_context_note=_clip(payload.structured_context_note),
        out_lang=prompts.language_name(payload.language),
    )
    try:
        raw = oai.generate_openai_text(api_key, user_text=user_text, max_tokens=8192, temperature=0.35, json_only=True)
        parsed = parse_json_loose(raw)
    except (oai.OpenAiClientError, ValueError) as e:
        raise HTTPException(status_code=502, detail=str(e))
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="Model javobi JSON obyekt emas.")
    return parsed


@router.post("/startup-ai/twenty-criteria/")
def startup_ai_twenty_criteria(
    payload: TwentyCriteriaRequest,
    auth: AuthContext = Depends(require_roles("startuper", "admin")),
) -> dict:
    api_key = _require_api_key()
    project_title = _clip(payload.project_title, 500)
    full_description = _clip(payload.full_description)
    if not project_title and not full_description:
        raise HTTPException(status_code=400, detail="project_title yoki full_description kerak.")

    user_text = prompts.twenty_criteria_user_prompt(
        project_title=project_title or "Loyiha",
        summary=_clip(payload.summary),
        full_description=full_description,
        structured_context_note=_clip(payload.structured_context_note),
        questionnaire_qa_block=_clip(payload.questionnaire_qa_block),
        out_lang=prompts.language_name(payload.language),
    )
    try:
        raw = oai.generate_openai_text(api_key, user_text=user_text, max_tokens=8192, temperature=0.28, json_only=True)
        parsed = parse_json_loose(raw)
    except (oai.OpenAiClientError, ValueError) as e:
        raise HTTPException(status_code=502, detail=str(e))
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="Model javobi JSON obyekt emas.")
    return parsed


@router.post("/startup-ai/innovation-pack/")
def startup_ai_innovation_pack(
    payload: InnovationPackRequest,
    auth: AuthContext = Depends(require_roles("startuper", "admin")),
) -> dict:
    api_key = _require_api_key()
    settings = get_settings()
    project_domain = payload.project_domain.strip().lower()
    if project_domain not in ("startup", "research"):
        project_domain = "startup"
    project_title = _clip(payload.project_title, 500)
    full_description = _clip(payload.full_description)
    if not project_title and not full_description:
        raise HTTPException(status_code=400, detail="project_title yoki full_description kerak.")

    user_text = prompts.innovation_pack_user_prompt(
        project_title=project_title or "Loyiha",
        summary=_clip(payload.summary),
        full_description=full_description,
        profile_note=_clip(payload.profile_note, 4000),
        workspace_extra_note=_clip(payload.workspace_extra_note),
        out_lang=prompts.language_name(payload.language),
        project_domain=project_domain,
    )
    temp = 0.36 if project_domain == "startup" else 0.42
    try:
        raw = oai.generate_openai_text(
            api_key,
            user_text=user_text,
            model=settings.openai_reasoner_model,
            max_tokens=16384,
            temperature=temp,
            json_only=True,
            timeout_sec=240,
        )
        parsed = parse_json_loose(raw)
    except (oai.OpenAiClientError, ValueError) as e:
        raise HTTPException(status_code=502, detail=str(e))
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="Model javobi JSON obyekt emas.")
    return parsed


@router.post("/startup-ai/coach-reply/", response_model=CoachReplyResponse)
def startup_ai_coach_reply(
    payload: CoachReplyRequest,
    auth: AuthContext = Depends(require_roles("startuper", "admin")),
) -> CoachReplyResponse:
    api_key = _require_api_key()
    clean_messages: list[dict] = []
    for m in payload.messages[-40:]:
        role = m.role.strip().lower()
        content = _clip(m.content, 32000)
        if role not in ("user", "assistant") or not content:
            continue
        clean_messages.append({"role": role, "content": content})
    if not clean_messages:
        raise HTTPException(status_code=400, detail="Yaroqli messages topilmadi.")

    ctx = payload.ctx if isinstance(payload.ctx, dict) else {}
    project_domain = str(ctx.get("project_domain") or "startup").strip().lower()
    if project_domain not in ("startup", "research"):
        project_domain = "startup"

    user_text = prompts.coach_user_prompt(
        messages=clean_messages,
        project_domain=project_domain,
        title=str(ctx.get("title") or "Loyiha"),
        summary=str(ctx.get("summary") or ""),
        description=str(ctx.get("description") or ""),
        workspace_profile_json=str(ctx.get("workspace_profile_json") or "{}"),
        analysis_json_excerpt=str(ctx.get("analysis_json_excerpt") or ""),
        out_lang=prompts.language_name(payload.language),
    )
    try:
        raw = oai.generate_openai_text(api_key, user_text=user_text, max_tokens=4096, temperature=0.45, json_only=False)
    except oai.OpenAiClientError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return CoachReplyResponse(reply=(raw or "").strip())
