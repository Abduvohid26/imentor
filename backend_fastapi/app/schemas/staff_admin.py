from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, field_validator


def _normalize_phone(value: str) -> str:
    digits = "".join(ch for ch in value if ch.isdigit())
    if len(digits) != 12 or not digits.startswith("998"):
        raise ValueError("phone_digits must be Uzbekistan 12-digit number.")
    return digits


class MeOut(BaseModel):
    id: int
    username: str
    role: str
    first_name: str = ""
    last_name: str = ""
    photo_url: str = ""
    student_id: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class AdminStaffUpsertRequest(BaseModel):
    phone_digits: str
    password: str = ""
    role: str = "hodim"
    first_name: str = ""
    last_name: str = ""
    faculty: str = ""
    department: str = ""
    department_id: int | None = None
    direction: str = ""
    participant_kind: str = ""
    study_group: str = ""
    job_title: str = ""

    @field_validator("phone_digits")
    @classmethod
    def _v_phone(cls, v: str) -> str:
        return _normalize_phone(v)

    @field_validator("role")
    @classmethod
    def _v_role(cls, v: str) -> str:
        v = (v or "hodim").strip().lower()
        return v if v in ("admin", "klinika_admin", "hodim", "startuper") else "hodim"


class AdminDeprovisionStaffRequest(BaseModel):
    phone_digits: str

    @field_validator("phone_digits")
    @classmethod
    def _v_phone(cls, v: str) -> str:
        return _normalize_phone(v)


class AvatarResponse(BaseModel):
    photo_url: str = ""


class AdminStaffListEntry(BaseModel):
    phone_digits: str
    phone_display: str
    first_name: str
    last_name: str
    display_name: str
    role: str
    faculty: str = ""
    department: str = ""
    department_id: int | None = None
    direction: str = ""
    participant_kind: str = ""
    study_group: str = ""
    job_title: str = ""
    is_active: bool
    date_joined: dt.datetime
    last_login: dt.datetime | None
