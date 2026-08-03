from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Table, Column
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

# Django tomonidan yaratilgan mavjud jadvallar (auth_user, auth_group,
# auth_user_groups). FastAPI tomon bu jadvallarga faqat o'qish/yozish qiladi —
# Alembic bu jadvallarni boshqarmaydi (Django migratsiyalari davom etadi,
# to'liq cutover'gacha).

user_groups = Table(
    "auth_user_groups",
    Base.metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", Integer, ForeignKey("auth_user.id", ondelete="CASCADE")),
    Column("group_id", Integer, ForeignKey("auth_group.id", ondelete="CASCADE")),
)


class Group(Base):
    __tablename__ = "auth_group"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True)


class User(Base):
    __tablename__ = "auth_user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    password: Mapped[str] = mapped_column(String(128))
    last_login: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    username: Mapped[str] = mapped_column(String(150), unique=True)
    first_name: Mapped[str] = mapped_column(String(150), default="")
    last_name: Mapped[str] = mapped_column(String(150), default="")
    email: Mapped[str] = mapped_column(String(254), default="")
    is_staff: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    date_joined: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))

    groups: Mapped[list[Group]] = relationship(secondary=user_groups, lazy="selectin")
