from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class StartupProjectApplication(Base):
    __tablename__ = "core_startupprojectapplication"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_key: Mapped[str] = mapped_column(String(128))
    title: Mapped[str] = mapped_column(String(512))
    summary: Mapped[str] = mapped_column(default="")
    description: Mapped[str] = mapped_column(default="")
    participant_kind: Mapped[str] = mapped_column(String(16), default="student")
    project_domain: Mapped[str] = mapped_column(String(20), default="startup")
    workspace_profile: Mapped[dict] = mapped_column(JSONB, default=dict)
    profile_snapshot: Mapped[dict] = mapped_column(JSONB, default=dict)
    ai_pack: Mapped[dict] = mapped_column(JSONB, default=dict)
    submission_dossier: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(16), default="draft")
    submitted_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
