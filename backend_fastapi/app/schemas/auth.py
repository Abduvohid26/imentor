from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class LocalLoginRequest(BaseModel):
    phone_digits: str = Field(max_length=20)
    password: str = Field(min_length=6, max_length=128)
    role: str | None = None
    first_name: str = ""
    last_name: str = ""
    register: bool = False

    @field_validator("phone_digits")
    @classmethod
    def _validate_phone(cls, value: str) -> str:
        digits = "".join(ch for ch in value if ch.isdigit())
        if len(digits) != 12 or not digits.startswith("998"):
            raise ValueError("phone_digits must be Uzbekistan 12-digit number.")
        return digits

    @field_validator("role")
    @classmethod
    def _validate_role(cls, value: str | None) -> str | None:
        if value is None:
            return value
        v = value.strip().lower()
        if v not in ("admin", "hodim", "startuper"):
            raise ValueError("role must be admin, hodim or startuper")
        return v


class LoginResponse(BaseModel):
    access: str
    refresh: str
    role: str
    username: str
    first_name: str = ""
    last_name: str = ""
    photo_url: str = ""
    student_id: str | None = None
    group_name: str | None = None


class TokenRefreshRequest(BaseModel):
    refresh: str


class TokenRefreshResponse(BaseModel):
    access: str
    refresh: str
