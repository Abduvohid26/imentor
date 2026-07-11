"""Authenticated REST endpoints: startup OpenAI calls (Celery orqali)."""

from __future__ import annotations

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .ai_async import dispatch_ai_job
from .permissions import IsStartuperOrAdmin
from .tasks import (
    run_startup_coach_reply,
    run_startup_innovation_pack,
    run_startup_questionnaire,
    run_startup_twenty_criteria,
)
from .throttling import StartupAiUserThrottle

_MAX_TEXT_FIELD = 120_000


def _clip(s: str, max_len: int = _MAX_TEXT_FIELD) -> str:
    t = (s or "").strip()
    return t[:max_len]


def _openai_key() -> str:
    return getattr(settings, "OPENAI_API_KEY", "") or ""


def _missing_key_response():
    return Response(
        {"detail": "OPENAI_API_KEY serverda sozlanmagan."},
        status=status.HTTP_503_SERVICE_UNAVAILABLE,
    )


class StartupAiQuestionnaireView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsStartuperOrAdmin]
    throttle_classes = [StartupAiUserThrottle]

    def post(self, request):
        if not _openai_key():
            return _missing_key_response()
        d = request.data if isinstance(request.data, dict) else {}
        project_title = _clip(str(d.get("project_title") or ""), 500)
        full_description = _clip(str(d.get("full_description") or ""))
        if not project_title and not full_description:
            return Response({"detail": "project_title yoki full_description kerak."}, status=400)
        payload = {
            "language": str(d.get("language") or "uz"),
            "project_title": project_title or "Loyiha",
            "summary": _clip(str(d.get("summary") or "")),
            "full_description": full_description,
            "structured_context_note": _clip(str(d.get("structured_context_note") or "")),
        }
        return dispatch_ai_job(
            user_id=request.user.pk,
            kind="startup_questionnaire",
            payload=payload,
            task=run_startup_questionnaire,
        )


class StartupAiTwentyCriteriaView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsStartuperOrAdmin]
    throttle_classes = [StartupAiUserThrottle]

    def post(self, request):
        if not _openai_key():
            return _missing_key_response()
        d = request.data if isinstance(request.data, dict) else {}
        project_title = _clip(str(d.get("project_title") or ""), 500)
        full_description = _clip(str(d.get("full_description") or ""))
        if not project_title and not full_description:
            return Response({"detail": "project_title yoki full_description kerak."}, status=400)
        payload = {
            "language": str(d.get("language") or "uz"),
            "project_title": project_title or "Loyiha",
            "summary": _clip(str(d.get("summary") or "")),
            "full_description": full_description,
            "structured_context_note": _clip(str(d.get("structured_context_note") or "")),
            "questionnaire_qa_block": _clip(str(d.get("questionnaire_qa_block") or "")),
        }
        return dispatch_ai_job(
            user_id=request.user.pk,
            kind="startup_twenty_criteria",
            payload=payload,
            task=run_startup_twenty_criteria,
        )


class StartupAiInnovationPackView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsStartuperOrAdmin]
    throttle_classes = [StartupAiUserThrottle]

    def post(self, request):
        if not _openai_key():
            return _missing_key_response()
        d = request.data if isinstance(request.data, dict) else {}
        project_domain = str(d.get("project_domain") or "startup").strip().lower()
        if project_domain not in ("startup", "research"):
            project_domain = "startup"
        project_title = _clip(str(d.get("project_title") or ""), 500)
        full_description = _clip(str(d.get("full_description") or ""))
        if not project_title and not full_description:
            return Response({"detail": "project_title yoki full_description kerak."}, status=400)
        payload = {
            "language": str(d.get("language") or "uz"),
            "project_domain": project_domain,
            "project_title": project_title or "Loyiha",
            "summary": _clip(str(d.get("summary") or "")),
            "full_description": full_description,
            "profile_note": _clip(str(d.get("profile_note") or ""), 4000),
            "workspace_extra_note": _clip(str(d.get("workspace_extra_note") or "")),
        }
        return dispatch_ai_job(
            user_id=request.user.pk,
            kind="startup_innovation_pack",
            payload=payload,
            task=run_startup_innovation_pack,
            timeout=240.0,
        )


class StartupAiCoachReplyView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsStartuperOrAdmin]
    throttle_classes = [StartupAiUserThrottle]

    def post(self, request):
        if not _openai_key():
            return _missing_key_response()
        d = request.data if isinstance(request.data, dict) else {}
        messages = d.get("messages")
        if not isinstance(messages, list) or not messages:
            return Response({"detail": "messages (ro'yxat) kerak."}, status=400)
        clean_messages: list[dict[str, str]] = []
        for m in messages[-40:]:
            if not isinstance(m, dict):
                continue
            role = str(m.get("role") or "").strip().lower()
            content = _clip(str(m.get("content") or ""), 32000)
            if role not in ("user", "assistant") or not content:
                continue
            clean_messages.append({"role": role, "content": content})
        if not clean_messages:
            return Response({"detail": "Yaroqli messages topilmadi."}, status=400)
        ctx = d.get("ctx") if isinstance(d.get("ctx"), dict) else {}
        payload = {
            "language": str(d.get("language") or "uz"),
            "messages": clean_messages,
            "ctx": ctx,
        }
        return dispatch_ai_job(
            user_id=request.user.pk,
            kind="startup_coach_reply",
            payload=payload,
            task=run_startup_coach_reply,
        )
