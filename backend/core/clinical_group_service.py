"""Klinika guruhi — aʼzolik va huquqlar."""

from __future__ import annotations

from django.contrib.auth.models import User

from .models import ClinicalGroup, ClinicalGroupMember
from .permissions import ALLOWED_ROLES, resolve_user_role

MEMBER_APP_ROLES = ("hodim", "startuper", "klinika_admin")


def clinic_for_klinika_admin(user: User, request=None) -> ClinicalGroup | None:
    role = resolve_user_role(user, request)
    if role != "klinika_admin":
        return None
    row = (
        ClinicalGroupMember.objects.filter(
            owner_key=user.username,
            is_clinic_admin=True,
            is_active=True,
            clinic__is_active=True,
        )
        .select_related("clinic")
        .first()
    )
    return row.clinic if row else None


def clinic_membership_for_user(owner_key: str) -> ClinicalGroupMember | None:
    return (
        ClinicalGroupMember.objects.filter(
            owner_key=owner_key,
            is_active=True,
            clinic__is_active=True,
        )
        .select_related("clinic")
        .first()
    )


def member_belongs_to_clinic(owner_key: str, clinic: ClinicalGroup) -> bool:
    return ClinicalGroupMember.objects.filter(
        clinic=clinic,
        owner_key=owner_key,
        is_active=True,
    ).exists()


def upsert_clinic_member(
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
    member, _ = ClinicalGroupMember.objects.update_or_create(
        clinic=clinic,
        owner_key=owner_key,
        defaults={
            "app_role": role,
            "is_clinic_admin": bool(is_clinic_admin),
            "first_name": (first_name or "").strip(),
            "last_name": (last_name or "").strip(),
            "faculty": (faculty or "").strip(),
            "department": (department or "").strip(),
            "direction": (direction or "").strip(),
            "job_title": (job_title or "").strip(),
            "study_group": (study_group or "").strip(),
            "participant_kind": (participant_kind or "").strip(),
            "is_active": True,
        },
    )
    return member


def deactivate_clinic_member(clinic: ClinicalGroup, owner_key: str) -> bool:
    updated = ClinicalGroupMember.objects.filter(
        clinic=clinic, owner_key=owner_key
    ).update(is_active=False, is_clinic_admin=False)
    return updated > 0


def clinic_auth_payload(user: User, request=None) -> dict:
    """JWT va /auth/me uchun klinika konteksti."""
    role = resolve_user_role(user, request)
    if role == "klinika_admin":
        clinic = clinic_for_klinika_admin(user, request)
        if clinic:
            return {
                "clinic_id": clinic.id,
                "clinic_name": clinic.name,
                "clinic_code": clinic.code,
            }
    membership = clinic_membership_for_user(user.username)
    if membership:
        return {
            "clinic_id": membership.clinic_id,
            "clinic_name": membership.clinic.name,
            "clinic_code": membership.clinic.code,
        }
    return {
        "clinic_id": None,
        "clinic_name": "",
        "clinic_code": "",
    }


def can_provision_role(actor_role: str | None, target_role: str) -> bool:
    target = (target_role or "hodim").strip().lower()
    if target not in ALLOWED_ROLES:
        return False
    if target == "admin":
        return actor_role == "admin"
    if target == "klinika_admin":
        return actor_role == "admin"
    if actor_role == "admin":
        return True
    if actor_role == "klinika_admin":
        return target in ("hodim", "startuper")
    return False
