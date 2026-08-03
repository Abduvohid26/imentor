from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, field_validator


class PreparedContentIn(BaseModel):
    kind: str
    topic: str
    topic_norm: str = ""
    author_display_name: str = ""
    subject_name: str = ""
    subject_code: str = ""
    variant_label: str = ""
    topic_code: str = ""
    payload: dict

    @field_validator("topic")
    @classmethod
    def _validate_topic(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("topic is too short.")
        return v


class PreparedContentOut(BaseModel):
    id: int
    owner_key: str
    kind: str
    topic: str
    topic_norm: str
    author_display_name: str
    subject_name: str
    subject_code: str
    variant_label: str
    topic_code: str
    payload: dict
    created_at: dt.datetime


class PreparedContentLatestOut(BaseModel):
    payload: dict | None = None
