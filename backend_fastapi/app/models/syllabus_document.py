from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class SyllabusDocument(Base):
    """Legacy: per-user syllabus (deprecated). Yangi katalog — CourseSyllabus."""

    __tablename__ = "core_syllabusdocument"
    __table_args__ = (
        UniqueConstraint("owner_key", "external_id", name="core_syllabus_owner_external_uniq"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_key: Mapped[str] = mapped_column(String(128))
    external_id: Mapped[str] = mapped_column(String(128))
    file_name: Mapped[str] = mapped_column(String(512))
    topics: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
