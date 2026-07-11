"""AI job holati — Redis cache (Celery worker natijasini saqlash)."""

from __future__ import annotations

import secrets
import time
from typing import Any

from django.core.cache import cache

_JOB_PREFIX = "ai-job:"
_DEFAULT_TTL = 3600


def _key(job_id: str) -> str:
    return f"{_JOB_PREFIX}{job_id}"


def create_ai_job(*, user_id: int, kind: str) -> str:
    job_id = f"ai_{secrets.token_urlsafe(12)}"
    payload = {
        "job_id": job_id,
        "status": "pending",
        "kind": kind,
        "user_id": user_id,
        "created_at": time.time(),
        "result": None,
        "error": None,
    }
    cache.set(_key(job_id), payload, timeout=_DEFAULT_TTL)
    return job_id


def get_ai_job(job_id: str) -> dict[str, Any] | None:
    raw = cache.get(_key(job_id))
    return raw if isinstance(raw, dict) else None


def update_ai_job(job_id: str, **fields: Any) -> None:
    job = get_ai_job(job_id)
    if job is None:
        return
    job.update(fields)
    job["updated_at"] = time.time()
    cache.set(_key(job_id), job, timeout=_DEFAULT_TTL)


def mark_ai_job_running(job_id: str) -> None:
    update_ai_job(job_id, status="running")


def mark_ai_job_completed(job_id: str, result: Any) -> None:
    update_ai_job(job_id, status="completed", result=result, error=None)


def mark_ai_job_failed(job_id: str, error: str) -> None:
    update_ai_job(job_id, status="failed", error=(error or "AI job failed")[:2000])


def wait_for_ai_job(job_id: str, *, timeout: float = 180.0, interval: float = 0.4) -> dict[str, Any]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = get_ai_job(job_id)
        if job is None:
            raise TimeoutError("AI job topilmadi.")
        status = str(job.get("status") or "")
        if status in ("completed", "failed"):
            return job
        time.sleep(interval)
    raise TimeoutError("AI job vaqti tugadi.")
