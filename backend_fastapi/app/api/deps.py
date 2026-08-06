from __future__ import annotations

import os

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_token
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)

ALLOWED_ROLES = ("admin", "klinika_admin", "hodim", "student")


class AuthContext:
    def __init__(self, user: User, role: str, student_id: str | None = None) -> None:
        self.user = user
        self.role = role
        self.student_id = student_id


def get_current_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> AuthContext:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Autentifikatsiya talab qilinadi.")
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token yaroqsiz yoki muddati o'tgan.")

    if payload.get("token_type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Access token talab qilinadi.")

    user_id = payload.get("user_id")
    user = db.get(User, int(user_id)) if user_id else None
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Foydalanuvchi topilmadi.")

    role = str(payload.get("role") or "").strip().lower()
    if role not in ALLOWED_ROLES:
        role = "hodim"
    return AuthContext(user=user, role=role, student_id=payload.get("student_id"))


def require_roles(*roles: str):
    def _dep(auth: AuthContext = Depends(get_current_auth)) -> AuthContext:
        if auth.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ruxsat yo'q.")
        return auth

    return _dep


def external_api_keys() -> frozenset[str]:
    raw = os.environ.get("IMENTOR_EXTERNAL_API_KEYS") or os.environ.get("EXTERNAL_API_KEYS") or ""
    return frozenset(part.strip() for part in raw.split(",") if part.strip())


def require_external_api_key(x_api_key: str | None = Header(default=None)) -> None:
    keys = external_api_keys()
    header = (x_api_key or "").strip()
    if not keys or not header or header not in keys:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Valid X-Api-Key header required.")
