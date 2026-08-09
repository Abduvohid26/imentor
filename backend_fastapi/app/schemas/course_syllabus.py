from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field, field_validator


class SyllabusVariantIn(BaseModel):
    label: str = Field(max_length=128)
    file_name: str = Field(max_length=512)
    topics: list[dict] = Field(min_length=1)


class CourseSyllabusUpsertRequest(BaseModel):
    subject_name: str | None = None
    subject_code: str = ""
    department_id: int | None = None
    description: str = ""
    file_name: str = ""
    topics: list[dict] = []
    variants: list[SyllabusVariantIn] = []
    sort_order: int = Field(default=0, ge=0, le=9999)
    is_active: bool = True
    append_variants: bool = False
    instruction_language: str = "uz"

    @field_validator("subject_name")
    @classmethod
    def _validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        v = value.strip()
        if len(v) < 2:
            raise ValueError("Fan nomi juda qisqa.")
        return v


class CourseSyllabusFullOut(BaseModel):
    id: int
    subject_name: str
    subject_code: str
    department: int | None
    department_name: str
    department_code: str
    description: str
    instruction_language: str
    file_name: str
    topics: list
    variants: list
    # Ko'rsatish uchun tarjimalar (asl nom o'zgarmaydi):
    #   name_i18n   -> {"ru": "...", "en": "..."}
    #   topics_i18n -> {"ru": {"<asl sarlavha>": "<tarjima>"}, ...}
    name_i18n: dict = {}
    topics_i18n: dict = {}
    sort_order: int
    is_active: bool
    created_at: dt.datetime
    updated_at: dt.datetime
