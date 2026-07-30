"""AI job dispatch + natijani kutish (frontend API o‘zgarishsiz qoladi)."""

from __future__ import annotations

from typing import Any, Callable

from rest_framework import status
from rest_framework.response import Response

from .ai_jobs import create_ai_job, get_ai_job, wait_for_ai_job


def dispatch_ai_job(
    *,
    user_id: int,
    kind: str,
    payload: dict[str, Any],
    task: Callable[..., Any],
    timeout: float = 180.0,
    extra: dict[str, Any] | None = None,
) -> Response:
    job_id = create_ai_job(user_id=user_id, kind=kind)
    task.delay(job_id, payload)

    try:
        job = wait_for_ai_job(job_id, timeout=timeout)
    except TimeoutError as e:
        return Response({"detail": str(e)}, status=status.HTTP_504_GATEWAY_TIMEOUT)

    if job.get("status") == "failed":
        return Response(
            {"detail": job.get("error") or "AI job failed"},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    result = job.get("result")
    if kind == "education_completion" and isinstance(result, dict):
        # `extra` — AI natijasidan TASHQARIDAGI, server aniq biladigan ma'lumot
        # (masalan RAG uchun ishlatilgan kitob/sahifalar). AI'ga tayanmaydi.
        return Response({"content": result.get("content", ""), **(extra or {})})
    if kind == "startup_coach_reply" and isinstance(result, dict):
        return Response({"reply": result.get("reply", "")})
    if isinstance(result, dict):
        return Response(result)
    return Response({"detail": "AI natijasi noto‘g‘ri formatda."}, status=status.HTTP_502_BAD_GATEWAY)


def ai_job_status_response(job_id: str, user_id: int) -> Response:
    job = get_ai_job(job_id)
    if job is None:
        return Response({"detail": "Job topilmadi."}, status=status.HTTP_404_NOT_FOUND)
    if int(job.get("user_id") or 0) != int(user_id):
        return Response({"detail": "Ruxsat yo‘q."}, status=status.HTTP_403_FORBIDDEN)
    return Response(
        {
            "job_id": job_id,
            "status": job.get("status"),
            "result": job.get("result"),
            "error": job.get("error"),
        }
    )
