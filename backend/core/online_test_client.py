"""OnlineTest auth API — talaba login manbai (bitta auth tizim)."""
from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urljoin

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

ACADEMIC_CATALOG_CACHE_KEY = "online_test:academic_catalog"
ACADEMIC_CATALOG_CACHE_TTL = 600  # 10 daqiqa


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


def online_test_consumer_api_key() -> str:
    return (getattr(settings, "ONLINE_TEST_CONSUMER_API_KEY", "") or "").strip()


def fetch_academic_catalog(*, timeout: float = 12.0, use_cache: bool = True) -> dict[str, Any]:
    """
    OnlineTest GET /api/public/academic-catalog/ — Kafedra -> Yo'nalish -> Guruh
    daraxti (X-Api-Key bilan himoyalangan, faqat o'qish).

    Muvaffaqiyat: {kafedralar: [{id,name,code,directions:[{id,name,groups:[
    {id,name,level,student_count}]}]}], unassigned_directions: [...]}

    Natija `ACADEMIC_CATALOG_CACHE_TTL` (10 daqiqa) davomida keshlanadi — bu
    ma'lumot tez-tez o'zgarmaydi, har so'rovda OnlineTest'ga urilmaslik uchun.
    """
    if use_cache:
        cached = cache.get(ACADEMIC_CATALOG_CACHE_KEY)
        if cached is not None:
            return cached

    base = online_test_api_base()
    if not base:
        raise OnlineTestAuthError("ONLINE_TEST_API_BASE_URL sozlanmagan.", status_code=503)
    api_key = online_test_consumer_api_key()
    if not api_key:
        raise OnlineTestAuthError("ONLINE_TEST_CONSUMER_API_KEY sozlanmagan.", status_code=503)

    url = urljoin(base + "/", "api/public/academic-catalog/")
    try:
        res = requests.get(
            url,
            timeout=timeout,
            headers={"Accept": "application/json", "X-Api-Key": api_key},
        )
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
        detail = str(body.get("error") or "OnlineTest academic-catalog xatosi.")
        raise OnlineTestAuthError(detail, status_code=502)

    if not isinstance(body, dict) or "kafedralar" not in body:
        raise OnlineTestAuthError("OnlineTest javobi noto'g'ri.", status_code=502)

    if use_cache:
        cache.set(ACADEMIC_CATALOG_CACHE_KEY, body, timeout=ACADEMIC_CATALOG_CACHE_TTL)
    return body


def split_person_name(full_name: str) -> tuple[str, str]:
    parts = [p for p in str(full_name or "").strip().split() if p]
    if not parts:
        return ("", "")
    if len(parts) == 1:
        return (parts[0], "")
    return (parts[0], " ".join(parts[1:]))
