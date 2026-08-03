from __future__ import annotations

import datetime as dt
import re

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, require_roles
from app.core.db import get_db
from app.models.clinical_group import ClinicalGroup, ClinicalGroupMember
from app.schemas.clinical_group import ClinicalGroupIn, ClinicalGroupMemberOut, ClinicalGroupOut, ClinicalGroupPatch
from app.services.pagination import paginate

router = APIRouter()


def _slugify(name: str) -> str:
    s = (name or "").strip().lower()
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    s = re.sub(r"[-\s]+", "-", s).strip("-")
    return (s or "klinika")[:64]


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


@router.get("/admin/clinical-groups/")
def admin_list_clinics(
    request: Request,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("admin")),
) -> dict:
    rows = db.execute(select(ClinicalGroup).order_by(ClinicalGroup.name)).scalars().all()
    out = [_clinic_out(db, r).model_dump() for r in rows]
    return paginate(out, request, default_page_size=30, max_page_size=100)


@router.post(
    "/admin/clinical-groups/",
    response_model=ClinicalGroupOut,
    status_code=status.HTTP_201_CREATED,
)
def admin_create_clinic(
    payload: ClinicalGroupIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("admin")),
) -> ClinicalGroupOut:
    now = dt.datetime.now(dt.timezone.utc)
    data = payload.model_dump()
    code = data.get("code", "").strip() or _slugify(data["name"])
    base_code = code
    n = 1
    while db.execute(select(ClinicalGroup).where(ClinicalGroup.code == code)).scalar_one_or_none():
        n += 1
        code = f"{base_code}-{n}"
    data["code"] = code
    obj = ClinicalGroup(**data, created_at=now, updated_at=now)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _clinic_out(db, obj)


@router.get("/admin/clinical-groups/{pk}/", response_model=ClinicalGroupOut)
def admin_get_clinic(
    pk: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("admin")),
) -> ClinicalGroupOut:
    obj = db.get(ClinicalGroup, pk)
    if obj is None:
        raise HTTPException(status_code=404, detail="Not found.")
    return _clinic_out(db, obj)


@router.patch("/admin/clinical-groups/{pk}/", response_model=ClinicalGroupOut)
def admin_update_clinic(
    pk: int,
    payload: ClinicalGroupPatch,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("admin")),
) -> ClinicalGroupOut:
    obj = db.get(ClinicalGroup, pk)
    if obj is None:
        raise HTTPException(status_code=404, detail="Not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    obj.updated_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
    db.refresh(obj)
    return _clinic_out(db, obj)


@router.delete("/admin/clinical-groups/{pk}/", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def admin_delete_clinic(
    pk: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("admin")),
) -> None:
    obj = db.get(ClinicalGroup, pk)
    if obj is None:
        raise HTTPException(status_code=404, detail="Not found.")
    db.delete(obj)
    db.commit()


@router.get("/admin/clinical-groups/{pk}/members/")
def admin_list_clinic_members(
    pk: int,
    request: Request,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("admin")),
) -> dict:
    if db.get(ClinicalGroup, pk) is None:
        raise HTTPException(status_code=404, detail="Not found.")
    rows = (
        db.execute(
            select(ClinicalGroupMember)
            .where(ClinicalGroupMember.clinic_id == pk)
            .order_by(ClinicalGroupMember.is_clinic_admin.desc(), ClinicalGroupMember.last_name, ClinicalGroupMember.first_name)
        )
        .scalars()
        .all()
    )
    out = [_member_out(r).model_dump() for r in rows]
    return paginate(out, request, default_page_size=50, max_page_size=200)
