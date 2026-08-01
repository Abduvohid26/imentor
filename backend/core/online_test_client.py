"""OnlineTest auth API — talaba login manbai (bitta auth tizim)."""
from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urljoin

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class OnlineTestAuthError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def online_test_api_base() -> str:
    return (getattr(settings, "ONLINE_TEST_API_BASE_URL", "") or "").strip().rstrip("/")


def online_test_login(student_id: str, password: str, *, timeout: float = 12.0) -> dict[str, Any]:
    """
    OnlineTest POST /api/auth/login.
    Muvaffaqiyat: {token, user{id, role, name, group_name, ...}}
    """
    base = online_test_api_base()
    if not base:
        raise OnlineTestAuthError("ONLINE_TEST_API_BASE_URL sozlanmagan.", status_code=503)

    url = urljoin(base + "/", "api/auth/login")
    try:
        res = requests.post(
            url,
            json={"id": student_id, "password": password},
            timeout=timeout,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
        )
    except requests.RequestException as exc:
        logger.warning("OnlineTest login network error: %s", exc)
        raise OnlineTestAuthError("OnlineTest ga ulanib bo'lmadi.", status_code=502) from exc

    try:
        body = res.json() if res.content else {}
    except ValueError:
        body = {}

    if res.status_code == 401:
        raise OnlineTestAuthError("ID yoki parol noto'g'ri.", status_code=401)
    if res.status_code == 403:
        detail = str(body.get("error") or "Kirish taqiqlangan.")
        raise OnlineTestAuthError(detail, status_code=403)
    if res.status_code >= 400:
        detail = str(body.get("error") or "OnlineTest login xatosi.")
        raise OnlineTestAuthError(detail, status_code=502)

    token = str(body.get("token") or "").strip()
    user = body.get("user") if isinstance(body.get("user"), dict) else {}
    if not token or not user.get("id"):
        raise OnlineTestAuthError("OnlineTest javobi noto'g'ri.", status_code=502)
    role = str(user.get("role") or "").strip().lower()
    if role != "student":
        raise OnlineTestAuthError("Faqat talaba akkaunti bilan kirish mumkin.", status_code=403)
    return {"token": token, "user": user}


def split_person_name(full_name: str) -> tuple[str, str]:
    parts = [p for p in str(full_name or "").strip().split() if p]
    if not parts:
        return ("", "")
    if len(parts) == 1:
        return (parts[0], "")
    return (parts[0], " ".join(parts[1:]))
