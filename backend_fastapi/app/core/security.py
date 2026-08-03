from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from jose import jwt
from passlib.context import CryptContext

from app.core.config import get_settings

settings = get_settings()

# Django default hasher (pbkdf2_sha256) — mavjud auth_user.password bilan mos,
# shunda ikki backend bir xil parollarni tekshira oladi (cutover davrida).
pwd_context = CryptContext(schemes=["django_pbkdf2_sha256"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not hashed_password:
        return False
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except ValueError:
        return False


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


ALGORITHM = "HS256"


def _create_token(subject: str, expires_delta: dt.timedelta, extra_claims: dict[str, Any]) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    payload = {
        "user_id": subject,
        "iat": now,
        "exp": now + expires_delta,
        "jti": uuid.uuid4().hex,
        **extra_claims,
    }
    return jwt.encode(payload, settings.django_secret_key, algorithm=ALGORITHM)


def create_access_token(user_id: int, extra_claims: dict[str, Any] | None = None) -> str:
    return _create_token(
        str(user_id),
        dt.timedelta(minutes=settings.django_jwt_access_minutes),
        {"token_type": "access", **(extra_claims or {})},
    )


def create_refresh_token(user_id: int, extra_claims: dict[str, Any] | None = None) -> str:
    return _create_token(
        str(user_id),
        dt.timedelta(days=settings.django_jwt_refresh_days),
        {"token_type": "refresh", **(extra_claims or {})},
    )


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.django_secret_key, algorithms=[ALGORITHM])
