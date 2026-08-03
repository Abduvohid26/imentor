from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field, field_validator


class SyllabusUpsertRequest(BaseModel):
    external_id: str = Field(max_length=128)
    file_name: str = Field(max_length=512)
    topics: list[dict] = []

    @field_validator("external_id")
    @classmethod
    def _validate_external_id(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 4:
            raise ValueError("external_id is too short.")
        return v


class SyllabusDocumentOut(BaseModel):
    id: int
    external_id: str
    file_name: str
    topics: list
    created_at: dt.datetime
