from __future__ import annotations

import datetime as dt
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, require_roles
from app.core.db import get_db
from app.core.security import hash_password
from app.models.clinical_group import ClinicalGroup, ClinicalGroupMember, ClinicalGroupPayment
from app.models.user import User
from app.schemas.clinical_group import (
    ClinicalGroupMemberCreateRequest,
    ClinicalGroupMemberOut,
    ClinicalGroupMemberPatchRequest,
    ClinicalGroupOut,
    ClinicalGroupPaymentIn,
    ClinicalGroupPaymentOut,
    ClinicalGroupPaymentPatch,
)
from app.services import auth_service, clinical_group_service as svc
from app.services.pagination import paginate

router = APIRouter()


def _clinic_out(db: Session, clinic: ClinicalGroup) -> ClinicalGroupOut:
    member_count = db.execute(
        select(func.count()).select_from(ClinicalGroupMember).where(
            ClinicalGroupMember.clinic_id == clinic.id, ClinicalGroupMember.is_active.is_(True)
        )
    ).scalar_one()
    admin_count = db.execute(
        select(func.count()).select_from(ClinicalGroupMember).where(
            ClinicalGroupMember.clinic_id == clinic.id,
            ClinicalGroupMember.is_active.is_(True),
            ClinicalGroupMember.is_clinic_admin.is_(True),
        )
    ).scalar_one()
    out = ClinicalGroupOut.model_validate(clinic)
    out.member_count = member_count
    out.admin_count = admin_count
    return out


def _member_out(m: ClinicalGroupMember) -> ClinicalGroupMemberOut:
    out = ClinicalGroupMemberOut.model_validate(m)
    out.display_name = f"{m.first_name} {m.last_name}".strip() or m.owner_key
    out.phone_display = f"+{m.owner_key}" if len(m.owner_key) == 12 else m.owner_key
    return out


def _payment_out(p: ClinicalGroupPayment) -> ClinicalGroupPaymentOut:
    return ClinicalGroupPaymentOut(
        id=p.id,
        clinic_id=p.clinic_id,
        amount_uzs=str(p.amount_uzs),
        period_label=p.period_label,
        period_start=p.period_start,
        period_end=p.period_end,
        status=p.status,
        paid_at=p.paid_at,
        payment_method=p.payment_method,
        reference=p.reference,
        notes=p.notes,
        created_by=p.created_by,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def _require_clinic(db: Session, auth: AuthContext) -> ClinicalGroup:
    clinic = svc.clinic_for_klinika_admin(db, auth.user.username, auth.role)
    if clinic is None:
        raise HTTPException(status_code=403, detail="Klinika administratori klinikaga bog'lanmagan.")
    return clinic


def _provision_user(
    db: Session, phone: str, password: str, role: str, first_name: str, last_name: str
) -> tuple[User, bool]:
    user = auth_service.get_user_by_username(db, phone)
    created = user is None
    if user is None:
        user = auth_service.create_user(db, phone, password, first_name, last_name)
    else:
        user.password = hash_password(password)
        user.first_name = first_name or user.first_name
        user.last_name = last_name or user.last_name
    role_to_set = role
    if role_to_set == "admin" and phone not in auth_service.demo_admin_phone_allowlist():
        role_to_set = "hodim"
    auth_service.set_user_role_group(db, user, role_to_set)
    return user, created


# ---------------- klinika_admin: dashboard ----------------


@router.get("/clinic-admin/dashboard/")
def clinic_admin_dashboard(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("klinika_admin")),
) -> dict:
    clinic = _require_clinic(db, auth)
    members_total = db.execute(
        select(func.count()).select_from(ClinicalGroupMember).where(
            ClinicalGroupMember.clinic_id == clinic.id, ClinicalGroupMember.is_active.is_(True)
        )
    ).scalar_one()
    members_hodim = db.execute(
        select(func.count()).select_from(ClinicalGroupMember).where(
            ClinicalGroupMember.clinic_id == clinic.id,
            ClinicalGroupMember.is_active.is_(True),
            ClinicalGroupMember.app_role == "hodim",
        )
    ).scalar_one()
    paid_total = db.execute(
        select(func.coalesce(func.sum(ClinicalGroupPayment.amount_uzs), 0)).where(
            ClinicalGroupPayment.clinic_id == clinic.id, ClinicalGroupPayment.status == "paid"
        )
    ).scalar_one()
    pending_total = db.execute(
        select(func.coalesce(func.sum(ClinicalGroupPayment.amount_uzs), 0)).where(
            ClinicalGroupPayment.clinic_id == clinic.id,
            ClinicalGroupPayment.status.in_(("pending", "overdue")),
        )
    ).scalar_one()
    overdue_count = db.execute(
        select(func.count()).select_from(ClinicalGroupPayment).where(
            ClinicalGroupPayment.clinic_id == clinic.id, ClinicalGroupPayment.status == "overdue"
        )
    ).scalar_one()

    return {
        "clinic": _clinic_out(db, clinic),
        "stats": {
            "members_total": members_total,
            "members_hodim": members_hodim,
            "payments_paid_total_uzs": str(paid_total),
            "payments_pending_total_uzs": str(pending_total),
            "payments_overdue_count": overdue_count,
        },
    }


# ---------------- klinika_admin: members ----------------


@router.get("/clinic-admin/members/")
def clinic_admin_list_members(
    request: Request,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("klinika_admin")),
) -> dict:
    clinic = _require_clinic(db, auth)
    rows = db.execute(
        select(ClinicalGroupMember)
        .where(ClinicalGroupMember.clinic_id == clinic.id, ClinicalGroupMember.is_active.is_(True))
        .order_by(ClinicalGroupMember.last_name, ClinicalGroupMember.first_name)
    ).scalars().all()
    out = [_member_out(m).model_dump() for m in rows]
    return paginate(out, request, default_page_size=50, max_page_size=200)


@router.post(
    "/clinic-admin/members/",
    response_model=ClinicalGroupMemberOut,
    status_code=status.HTTP_201_CREATED,
)
def clinic_admin_create_member(
    payload: ClinicalGroupMemberCreateRequest,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("klinika_admin")),
) -> ClinicalGroupMemberOut:
    clinic = _require_clinic(db, auth)
    if not svc.can_provision_role(auth.role, payload.app_role):
        raise HTTPException(status_code=403, detail="Bu rolni tayinlash huquqi yo'q.")

    digits = "".join(ch for ch in payload.phone_digits if ch.isdigit())
    if len(digits) != 12 or not digits.startswith("998"):
        raise HTTPException(status_code=400, detail="Telefon 998XXXXXXXXX formatida bo'lishi kerak.")

    user, _ = _provision_user(db, digits, payload.password, payload.app_role, payload.first_name, payload.last_name)
    member = svc.upsert_clinic_member(
        db,
        clinic,
        digits,
        app_role=payload.app_role,
        is_clinic_admin=False,
        first_name=payload.first_name or user.first_name,
        last_name=payload.last_name or user.last_name,
        faculty=payload.faculty,
        department=payload.department,
        direction=payload.direction,
        job_title=payload.job_title,
        study_group=payload.study_group,
        participant_kind=payload.participant_kind,
    )
    db.commit()
    db.refresh(member)
    return _member_out(member)


@router.patch("/clinic-admin/members/{member_id}/", response_model=ClinicalGroupMemberOut)
def clinic_admin_update_member(
    member_id: int,
    payload: ClinicalGroupMemberPatchRequest,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("klinika_admin")),
) -> ClinicalGroupMemberOut:
    clinic = _require_clinic(db, auth)
    member = db.execute(
        select(ClinicalGroupMember).where(
            ClinicalGroupMember.id == member_id, ClinicalGroupMember.clinic_id == clinic.id
        )
    ).scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404, detail="Topilmadi.")
    if member.is_clinic_admin:
        raise HTTPException(status_code=403, detail="Klinika administratorini faqat tizim admini o'zgartiradi.")

    data = payload.model_dump(exclude_unset=True)
    if "app_role" in data:
        if not svc.can_provision_role(auth.role, data["app_role"]):
            raise HTTPException(status_code=403, detail="Bu rolni tayinlash huquqi yo'q.")
        member.app_role = data["app_role"]
        user = auth_service.get_user_by_username(db, member.owner_key)
        if user is not None:
            auth_service.set_user_role_group(db, user, data["app_role"])

    for field in (
        "first_name", "last_name", "faculty", "department", "direction",
        "job_title", "study_group", "participant_kind", "is_active",
    ):
        if field in data:
            setattr(member, field, data[field])

    if data.get("password"):
        user = auth_service.get_user_by_username(db, member.owner_key)
        if user is not None:
            user.password = hash_password(data["password"])

    member.updated_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
    db.refresh(member)
    return _member_out(member)


@router.delete("/clinic-admin/members/{member_id}/", status_code=204, response_model=None)
def clinic_admin_delete_member(
    member_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("klinika_admin")),
) -> None:
    clinic = _require_clinic(db, auth)
    member = db.execute(
        select(ClinicalGroupMember).where(
            ClinicalGroupMember.id == member_id, ClinicalGroupMember.clinic_id == clinic.id
        )
    ).scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404, detail="Topilmadi.")
    if member.is_clinic_admin:
        raise HTTPException(status_code=403, detail="Klinika administratorini o'chirib bo'lmaydi.")
    if auth.user.username == member.owner_key:
        raise HTTPException(status_code=400, detail="O'zingizni o'chira olmaysiz.")

    svc.deactivate_clinic_member(db, clinic, member.owner_key)
    user = auth_service.get_user_by_username(db, member.owner_key)
    if user is not None and not user.is_superuser:
        db.delete(user)
    db.commit()


# ---------------- klinika_admin: payments ----------------


def _parse_decimal(value: str) -> Decimal:
    try:
        return Decimal(value)
    except (InvalidOperation, TypeError):
        raise HTTPException(status_code=400, detail="amount_uzs noto'g'ri format.")


@router.get("/clinic-admin/payments/")
def clinic_admin_list_payments(
    request: Request,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("klinika_admin")),
) -> dict:
    clinic = _require_clinic(db, auth)
    rows = db.execute(
        select(ClinicalGroupPayment)
        .where(ClinicalGroupPayment.clinic_id == clinic.id)
        .order_by(ClinicalGroupPayment.period_start.desc(), ClinicalGroupPayment.created_at.desc())
    ).scalars().all()
    out = [_payment_out(p).model_dump() for p in rows]
    return paginate(out, request, default_page_size=30, max_page_size=100)


@router.post(
    "/clinic-admin/payments/",
    response_model=ClinicalGroupPaymentOut,
    status_code=status.HTTP_201_CREATED,
)
def clinic_admin_create_payment(
    payload: ClinicalGroupPaymentIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("klinika_admin")),
) -> ClinicalGroupPaymentOut:
    clinic = _require_clinic(db, auth)
    now = dt.datetime.now(dt.timezone.utc)
    obj = ClinicalGroupPayment(
        clinic_id=clinic.id,
        amount_uzs=_parse_decimal(payload.amount_uzs),
        period_label=payload.period_label,
        period_start=payload.period_start,
        period_end=payload.period_end,
        status=payload.status,
        payment_method=payload.payment_method,
        reference=payload.reference,
        notes=payload.notes,
        created_by=auth.user.username,
        created_at=now,
        updated_at=now,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _payment_out(obj)


@router.patch("/clinic-admin/payments/{payment_id}/", response_model=ClinicalGroupPaymentOut)
def clinic_admin_update_payment(
    payment_id: int,
    payload: ClinicalGroupPaymentPatch,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("klinika_admin")),
) -> ClinicalGroupPaymentOut:
    clinic = _require_clinic(db, auth)
    obj = db.execute(
        select(ClinicalGroupPayment).where(
            ClinicalGroupPayment.id == payment_id, ClinicalGroupPayment.clinic_id == clinic.id
        )
    ).scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail="Topilmadi.")

    data = payload.model_dump(exclude_unset=True)
    if "amount_uzs" in data:
        obj.amount_uzs = _parse_decimal(data.pop("amount_uzs"))
    for field, value in data.items():
        setattr(obj, field, value)

    if obj.status == "paid" and obj.paid_at is None:
        obj.paid_at = dt.datetime.now(dt.timezone.utc)
    obj.updated_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
    db.refresh(obj)
    return _payment_out(obj)


@router.delete("/clinic-admin/payments/{payment_id}/", status_code=204, response_model=None)
def clinic_admin_delete_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("klinika_admin")),
) -> None:
    clinic = _require_clinic(db, auth)
    obj = db.execute(
        select(ClinicalGroupPayment).where(
            ClinicalGroupPayment.id == payment_id, ClinicalGroupPayment.clinic_id == clinic.id
        )
    ).scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail="Topilmadi.")
    if obj.status == "paid":
        raise HTTPException(status_code=400, detail="To'langan yozuvni o'chirib bo'lmaydi.")
    db.delete(obj)
    db.commit()


# ---------------- tizim admin: klinikaga admin tayinlash ----------------


@router.post("/admin/clinical-groups/{pk}/assign-admin/")
def admin_assign_clinic_admin(
    pk: int,
    payload: ClinicalGroupMemberCreateRequest,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("admin")),
) -> dict:
    clinic = db.execute(
        select(ClinicalGroup).where(ClinicalGroup.id == pk, ClinicalGroup.is_active.is_(True))
    ).scalar_one_or_none()
    if clinic is None:
        raise HTTPException(status_code=404, detail="Klinika topilmadi.")

    digits = "".join(ch for ch in payload.phone_digits if ch.isdigit())
    if len(digits) != 12 or not digits.startswith("998"):
        raise HTTPException(status_code=400, detail="Telefon 998XXXXXXXXX formatida bo'lishi kerak.")

    user, created = _provision_user(db, digits, payload.password, "klinika_admin", payload.first_name, payload.last_name)
    member = svc.upsert_clinic_member(
        db, clinic, digits, app_role="klinika_admin", is_clinic_admin=True,
        first_name=payload.first_name or user.first_name, last_name=payload.last_name or user.last_name,
    )
    db.commit()
    db.refresh(member)
    return JSONResponse(
        {
            "username": digits,
            "role": "klinika_admin",
            "clinic_id": clinic.id,
            "member_id": member.id,
            "created": created,
        },
        status_code=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )
