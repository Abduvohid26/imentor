from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field


class StartupApplicationIn(BaseModel):
    title: str = Field(max_length=512)
    summary: str = ""
    description: str = ""
    participant_kind: str = "student"
    project_domain: str = "startup"
    workspace_profile: dict = {}
    profile_snapshot: dict = {}
    ai_pack: dict = {}
    submission_dossier: dict = {}


class StartupApplicationPatch(BaseModel):
    title: str | None = None
    summary: str | None = None
    description: str | None = None
    participant_kind: str | None = None
    project_domain: str | None = None
    workspace_profile: dict | None = None
    profile_snapshot: dict | None = None
    ai_pack: dict | None = None
    submission_dossier: dict | None = None


class StartupApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_key: str
    title: str
    summary: str
    description: str
    participant_kind: str
    project_domain: str
    workspace_profile: dict
    profile_snapshot: dict
    ai_pack: dict
    submission_dossier: dict
    status: str
    submitted_at: dt.datetime | None
    created_at: dt.datetime
    updated_at: dt.datetime
