"""Celery tasklar — OpenAI chaqiruvlari shu yerda (Gunicorn workerlardan ajratilgan)."""

from __future__ import annotations

import json
import re
from typing import Any

from celery import shared_task
from django.conf import settings

from .ai_jobs import mark_ai_job_completed, mark_ai_job_failed, mark_ai_job_running
from .education_ai_utils import clip_education_messages
from .openai_client import (
    OPENAI_REASONER,
    OpenAiClientError,
    _extract_text,
    _http_post,
    generate_openai_text,
    resolve_openai_model,
)
from .startup_ai_prompts import (
    coach_user_prompt,
    innovation_pack_user_prompt,
    language_name,
    questionnaire_user_prompt,
    twenty_criteria_user_prompt,
)


def _openai_key() -> str:
    return (getattr(settings, "OPENAI_API_KEY", "") or "").strip()


def _parse_json_loose(text: str) -> Any:
    if not text or not str(text).strip():
        raise ValueError("Empty response from AI")
    json_string = str(text).strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", json_string)
    if m:
        json_string = m.group(1).strip()
    try:
        return json.loads(json_string)
    except json.JSONDecodeError:
        obj_start = json_string.find("{")
        arr_start = json_string.find("[")
        if obj_start == -1:
            start = arr_start
        elif arr_start == -1:
            start = obj_start
        else:
            start = min(obj_start, arr_start)
        obj_end = json_string.rfind("}")
        arr_end = json_string.rfind("]")
        end = max(obj_end, arr_end)
        if start >= 0 and end > start:
            return json.loads(json_string[start : end + 1])
        raise


@shared_task(bind=True, name="core.run_education_ai_completion", queue="ai")
def run_education_ai_completion(self, job_id: str, payload: dict[str, Any]) -> None:
    mark_ai_job_running(job_id)
    api_key = _openai_key()
    if not api_key:
        mark_ai_job_failed(job_id, "OpenAI API kaliti serverda sozlanmagan.")
        return
    try:
        model = resolve_openai_model(str(payload.get("model") or ""))
        messages = clip_education_messages(payload.get("messages") or [])
        if not messages:
            mark_ai_job_failed(job_id, "Xabarlar bo‘sh.")
            return
        body: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": int(payload.get("max_tokens") or 4096),
            "temperature": float(
                payload.get("temperature") if payload.get("temperature") is not None else 0.35
            ),
            "stream": False,
        }
        resp = _http_post(api_key, body, timeout_sec=270)
        content = _extract_text(resp)
        mark_ai_job_completed(job_id, {"content": content})
    except (OpenAiClientError, ValueError, TypeError) as e:
        mark_ai_job_failed(job_id, str(e))


@shared_task(bind=True, name="core.run_startup_questionnaire", queue="ai")
def run_startup_questionnaire(self, job_id: str, payload: dict[str, Any]) -> None:
    mark_ai_job_running(job_id)
    api_key = _openai_key()
    if not api_key:
        mark_ai_job_failed(job_id, "OPENAI_API_KEY serverda sozlanmagan.")
        return
    try:
        lang = str(payload.get("language") or "uz").strip().lower() or "uz"
        user_text = questionnaire_user_prompt(
            project_title=str(payload.get("project_title") or "Loyiha"),
            summary=str(payload.get("summary") or ""),
            full_description=str(payload.get("full_description") or ""),
            structured_context_note=str(payload.get("structured_context_note") or ""),
            out_lang=language_name(lang),
        )
        raw_text = generate_openai_text(
            api_key,
            user_text=user_text,
            max_tokens=8192,
            temperature=0.35,
            json_only=True,
        )
        parsed = _parse_json_loose(raw_text)
        if not isinstance(parsed, dict):
            raise ValueError("Model javobi JSON obyekt emas.")
        mark_ai_job_completed(job_id, parsed)
    except (OpenAiClientError, ValueError, json.JSONDecodeError) as e:
        mark_ai_job_failed(job_id, str(e))


@shared_task(bind=True, name="core.run_startup_twenty_criteria", queue="ai")
def run_startup_twenty_criteria(self, job_id: str, payload: dict[str, Any]) -> None:
    mark_ai_job_running(job_id)
    api_key = _openai_key()
    if not api_key:
        mark_ai_job_failed(job_id, "OPENAI_API_KEY serverda sozlanmagan.")
        return
    try:
        lang = str(payload.get("language") or "uz").strip().lower() or "uz"
        user_text = twenty_criteria_user_prompt(
            project_title=str(payload.get("project_title") or "Loyiha"),
            summary=str(payload.get("summary") or ""),
            full_description=str(payload.get("full_description") or ""),
            structured_context_note=str(payload.get("structured_context_note") or ""),
            questionnaire_qa_block=str(payload.get("questionnaire_qa_block") or ""),
            out_lang=language_name(lang),
        )
        raw_text = generate_openai_text(
            api_key,
            user_text=user_text,
            max_tokens=8192,
            temperature=0.28,
            json_only=True,
        )
        parsed = _parse_json_loose(raw_text)
        if not isinstance(parsed, dict):
            raise ValueError("Model javobi JSON obyekt emas.")
        mark_ai_job_completed(job_id, parsed)
    except (OpenAiClientError, ValueError, json.JSONDecodeError) as e:
        mark_ai_job_failed(job_id, str(e))


@shared_task(bind=True, name="core.run_startup_innovation_pack", queue="ai")
def run_startup_innovation_pack(self, job_id: str, payload: dict[str, Any]) -> None:
    mark_ai_job_running(job_id)
    api_key = _openai_key()
    if not api_key:
        mark_ai_job_failed(job_id, "OPENAI_API_KEY serverda sozlanmagan.")
        return
    try:
        lang = str(payload.get("language") or "uz").strip().lower() or "uz"
        project_domain = str(payload.get("project_domain") or "startup").strip().lower()
        if project_domain not in ("startup", "research"):
            project_domain = "startup"
        user_text = innovation_pack_user_prompt(
            project_title=str(payload.get("project_title") or "Loyiha"),
            summary=str(payload.get("summary") or ""),
            full_description=str(payload.get("full_description") or ""),
            profile_note=str(payload.get("profile_note") or ""),
            workspace_extra_note=str(payload.get("workspace_extra_note") or ""),
            out_lang=language_name(lang),
            project_domain=project_domain,
        )
        temp = 0.36 if project_domain == "startup" else 0.42
        raw_text = generate_openai_text(
            api_key,
            user_text=user_text,
            model=OPENAI_REASONER,
            max_tokens=16384,
            temperature=temp,
            json_only=True,
        )
        parsed = _parse_json_loose(raw_text)
        if not isinstance(parsed, dict):
            raise ValueError("Model javobi JSON obyekt emas.")
        mark_ai_job_completed(job_id, parsed)
    except (OpenAiClientError, ValueError, json.JSONDecodeError) as e:
        mark_ai_job_failed(job_id, str(e))


@shared_task(bind=True, name="core.run_startup_coach_reply", queue="ai")
def run_startup_coach_reply(self, job_id: str, payload: dict[str, Any]) -> None:
    mark_ai_job_running(job_id)
    api_key = _openai_key()
    if not api_key:
        mark_ai_job_failed(job_id, "OPENAI_API_KEY serverda sozlanmagan.")
        return
    try:
        lang = str(payload.get("language") or "uz").strip().lower() or "uz"
        messages = payload.get("messages") if isinstance(payload.get("messages"), list) else []
        ctx = payload.get("ctx") if isinstance(payload.get("ctx"), dict) else {}
        project_domain = str(ctx.get("project_domain") or "startup").strip().lower()
        if project_domain not in ("startup", "research"):
            project_domain = "startup"
        user_text = coach_user_prompt(
            messages=messages,
            project_domain=project_domain,
            title=str(ctx.get("title") or "Loyiha"),
            summary=str(ctx.get("summary") or ""),
            description=str(ctx.get("description") or ""),
            workspace_profile_json=str(ctx.get("workspace_profile_json") or "{}"),
            analysis_json_excerpt=str(ctx.get("analysis_json_excerpt") or ""),
            out_lang=language_name(lang),
        )
        raw_text = generate_openai_text(
            api_key,
            user_text=user_text,
            max_tokens=4096,
            temperature=0.45,
            json_only=False,
        )
        reply = (raw_text or "").strip()
        if not reply:
            raise ValueError("Empty coach reply")
        mark_ai_job_completed(job_id, {"reply": reply})
    except (OpenAiClientError, ValueError) as e:
        mark_ai_job_failed(job_id, str(e))
