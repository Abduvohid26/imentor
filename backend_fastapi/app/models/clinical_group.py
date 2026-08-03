from __future__ import annotations

import datetime as dt
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class ClinicalGroup(Base):
    __tablename__ = "core_clinicalgroup"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    code: Mapped[str] = mapped_column(String(64), unique=True, default="")
    address: Mapped[str] = mapped_column(String(512), default="")
    phone: Mapped[str] = mapped_column(String(32), default="")
    contact_person: Mapped[str] = mapped_column(String(255), default="")
    subscription_plan: Mapped[str] = mapped_column(String(32), default="standard")
    subscription_status: Mapped[str] = mapped_column(String(32), default="active")
    subscription_until: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))


class ClinicalGroupMember(Base):
    __tablename__ = "core_clinicalgroupmember"

    id: Mapped[int] = mapped_column(primary_key=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("core_clinicalgroup.id", ondelete="CASCADE"))
    owner_key: Mapped[str] = mapped_column(String(128))
    app_role: Mapped[str] = mapped_column(String(16), default="hodim")
    is_clinic_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    first_name: Mapped[str] = mapped_column(String(128), default="")
    last_name: Mapped[str] = mapped_column(String(128), default="")
    faculty: Mapped[str] = mapped_column(String(255), default="")
    department: Mapped[str] = mapped_column(String(255), default="")
    direction: Mapped[str] = mapped_column(String(255), default="")
    job_title: Mapped[str] = mapped_column(String(255), default="")
    study_group: Mapped[str] = mapped_column(String(128), default="")
    participant_kind: Mapped[str] = mapped_column(String(16), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    joined_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))

    clinic: Mapped[ClinicalGroup] = relationship(lazy="joined")


class ClinicalGroupPayment(Base):
    __tablename__ = "core_clinicalgrouppayment"

    id: Mapped[int] = mapped_column(primary_key=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("core_clinicalgroup.id", ondelete="CASCADE"))
    amount_uzs: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    period_label: Mapped[str] = mapped_column(String(128))
    period_start: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    paid_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payment_method: Mapped[str] = mapped_column(String(64), default="")
    reference: Mapped[str] = mapped_column(String(128), default="")
    notes: Mapped[str] = mapped_column(default="")
    created_by: Mapped[str] = mapped_column(String(128), default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))

    clinic: Mapped[ClinicalGroup] = relationship(lazy="joined")
