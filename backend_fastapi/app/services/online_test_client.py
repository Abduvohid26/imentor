from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urljoin

import requests

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_catalog_cache: dict[str, Any] = {"data": None, "expires_at": 0.0}
ACADEMIC_CATALOG_CACHE_TTL = 300


class OnlineTestAuthError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def online_test_login(student_id: str, password: str, *, timeout: float = 12.0) -> dict[str, Any]:
    settings = get_settings()
    base = settings.online_test_api_base_url.strip().rstrip("/")
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
        raise OnlineTestAuthError(str(body.get("error") or "Kirish taqiqlangan."), status_code=403)
    if res.status_code >= 400:
        raise OnlineTestAuthError(str(body.get("error") or "OnlineTest login xatosi."), status_code=502)

    token = str(body.get("token") or "").strip()
    user = body.get("user") if isinstance(body.get("user"), dict) else {}
    if not token or not user.get("id"):
        raise OnlineTestAuthError("OnlineTest javobi noto'g'ri.", status_code=502)
    role = str(user.get("role") or "").strip().lower()
    if role != "student":
        raise OnlineTestAuthError("Faqat talaba akkaunti bilan kirish mumkin.", status_code=403)
    return {"token": token, "user": user}


def fetch_academic_catalog(*, timeout: float = 12.0, use_cache: bool = True) -> dict[str, Any]:
    import time

    if use_cache and _catalog_cache["data"] is not None and _catalog_cache["expires_at"] > time.time():
        return _catalog_cache["data"]

    settings = get_settings()
    base = settings.online_test_api_base_url.strip().rstrip("/")
    if not base:
        raise OnlineTestAuthError("ONLINE_TEST_API_BASE_URL sozlanmagan.", status_code=503)
    api_key = settings.online_test_consumer_api_key.strip()
    if not api_key:
        raise OnlineTestAuthError("ONLINE_TEST_CONSUMER_API_KEY sozlanmagan.", status_code=503)

    url = urljoin(base + "/", "api/public/academic-catalog/")
    try:
        res = requests.get(url, timeout=timeout, headers={"Accept": "application/json", "X-Api-Key": api_key})
    except requests.RequestException as exc:
        logger.warning("OnlineTest academic-catalog network error: %s", exc)
        raise OnlineTestAuthError("OnlineTest ga ulanib bo'lmadi.", status_code=502) from exc

    try:
        body = res.json() if res.content else {}
    except ValueError:
        body = {}

    if res.status_code == 403:
        raise OnlineTestAuthError("OnlineTest API kalit rad etildi.", status_code=502)
    if res.status_code >= 400:
        raise OnlineTestAuthError(str(body.get("error") or "OnlineTest academic-catalog xatosi."), status_code=502)
    if not isinstance(body, dict) or "kafedralar" not in body:
        raise OnlineTestAuthError("OnlineTest javobi noto'g'ri.", status_code=502)

    if use_cache:
        _catalog_cache["data"] = body
        _catalog_cache["expires_at"] = time.time() + ACADEMIC_CATALOG_CACHE_TTL
    return body


def split_person_name(full_name: str) -> tuple[str, str]:
    parts = [p for p in str(full_name or "").strip().split() if p]
    if not parts:
        return ("", "")
    if len(parts) == 1:
        return (parts[0], "")
    return (parts[0], " ".join(parts[1:]))
