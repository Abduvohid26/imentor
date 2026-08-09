from __future__ import annotations

import datetime as dt

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class AcademicDepartment(Base):
    __tablename__ = "core_academicdepartment"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    sort_order: Mapped[int] = mapped_column(SmallInteger, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))


class CourseSyllabus(Base):
    __tablename__ = "core_coursesyllabus"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subject_name: Mapped[str] = mapped_column(String(255))
    subject_code: Mapped[str] = mapped_column(String(64), unique=True)
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("core_academicdepartment.id"), nullable=True
    )
    description: Mapped[str] = mapped_column(String(512), default="")
    instruction_language: Mapped[str] = mapped_column(String(8), default="uz")
    file_name: Mapped[str] = mapped_column(String(512))
    topics: Mapped[list] = mapped_column(JSONB, default=list)
    variants: Mapped[list] = mapped_column(JSONB, default=list)
    # Interfeys tiliga moslash uchun tarjimalar. ASL nom hech qachon
    # o'zgarmaydi — u kalit va AI promptlari uchun ishlatiladi; bu yerda
    # faqat KO'RSATISH uchun variantlar saqlanadi.
    #   name_i18n   -> {"ru": "...", "en": "..."}
    #   topics_i18n -> {"ru": {"<asl sarlavha>": "<tarjima>"}, "en": {...}}
    name_i18n: Mapped[dict] = mapped_column(JSONB, default=dict)
    topics_i18n: Mapped[dict] = mapped_column(JSONB, default=dict)
    sort_order: Mapped[int] = mapped_column(SmallInteger, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))

    department: Mapped[AcademicDepartment | None] = relationship(lazy="joined")


class StaffCourseSelection(Base):
    __tablename__ = "core_staffcourseselection"
    __table_args__ = (
        UniqueConstraint(
            "owner_key", "syllabus_id", "variant_label",
            name="core_staff_course_selection_variant_uniq",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_key: Mapped[str] = mapped_column(String(128))
    syllabus_id: Mapped[int] = mapped_column(ForeignKey("core_coursesyllabus.id", ondelete="CASCADE"))
    variant_label: Mapped[str] = mapped_column(String(128), default="")
    selected_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))

    syllabus: Mapped[CourseSyllabus] = relationship(lazy="joined")
