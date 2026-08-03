from __future__ import annotations

import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.clinical_group import ClinicalGroup, ClinicalGroupMember

MEMBER_APP_ROLES = ("hodim", "startuper", "klinika_admin")
ALLOWED_ROLES = ("admin", "klinika_admin", "hodim", "startuper", "student")


def clinic_for_klinika_admin(db: Session, username: str, role: str) -> ClinicalGroup | None:
    if role != "klinika_admin":
        return None
    row = db.execute(
        select(ClinicalGroupMember).where(
            ClinicalGroupMember.owner_key == username,
            ClinicalGroupMember.is_clinic_admin.is_(True),
            ClinicalGroupMember.is_active.is_(True),
        )
    ).scalars().first()
    if row is None:
        return None
    clinic = db.get(ClinicalGroup, row.clinic_id)
    return clinic if clinic and clinic.is_active else None


def upsert_clinic_member(
    db: Session,
    clinic: ClinicalGroup,
    owner_key: str,
    *,
    app_role: str = "hodim",
    is_clinic_admin: bool = False,
    first_name: str = "",
    last_name: str = "",
    faculty: str = "",
    department: str = "",
    direction: str = "",
    job_title: str = "",
    study_group: str = "",
    participant_kind: str = "",
) -> ClinicalGroupMember:
    role = (app_role or "hodim").strip().lower()
    if role not in MEMBER_APP_ROLES:
        role = "hodim"
    member = db.execute(
        select(ClinicalGroupMember).where(
            ClinicalGroupMember.clinic_id == clinic.id, ClinicalGroupMember.owner_key == owner_key
        )
    ).scalar_one_or_none()
    now = dt.datetime.now(dt.timezone.utc)
    if member is None:
        member = ClinicalGroupMember(
            clinic_id=clinic.id,
            owner_key=owner_key,
            joined_at=now,
            updated_at=now,
        )
        db.add(member)
    member.app_role = role
    member.is_clinic_admin = bool(is_clinic_admin)
    member.first_name = (first_name or "").strip()
    member.last_name = (last_name or "").strip()
    member.faculty = (faculty or "").strip()
    member.department = (department or "").strip()
    member.direction = (direction or "").strip()
    member.job_title = (job_title or "").strip()
    member.study_group = (study_group or "").strip()
    member.participant_kind = (participant_kind or "").strip()
    member.is_active = True
    member.updated_at = now
    db.flush()
    return member


def deactivate_clinic_member(db: Session, clinic: ClinicalGroup, owner_key: str) -> bool:
    member = db.execute(
        select(ClinicalGroupMember).where(
            ClinicalGroupMember.clinic_id == clinic.id, ClinicalGroupMember.owner_key == owner_key
        )
    ).scalar_one_or_none()
    if member is None:
        return False
    member.is_active = False
    member.is_clinic_admin = False
    return True


def can_provision_role(actor_role: str | None, target_role: str) -> bool:
    target = (target_role or "hodim").strip().lower()
    if target not in ALLOWED_ROLES:
        return False
    if target in ("admin", "klinika_admin"):
        return actor_role == "admin"
    if actor_role == "admin":
        return True
    if actor_role == "klinika_admin":
        return target in ("hodim", "startuper")
    return False
