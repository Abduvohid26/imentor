from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, require_roles
from app.core.db import get_db
from app.models.startup import StartupProjectApplication
from app.schemas.startup import StartupApplicationIn, StartupApplicationOut, StartupApplicationPatch
from app.services.pagination import paginate

router = APIRouter()


def _get_owned_or_admin(db: Session, pk: int, auth: AuthContext) -> StartupProjectApplication:
    obj = db.get(StartupProjectApplication, pk)
    if obj is None:
        raise HTTPException(status_code=404, detail="Not found.")
    if auth.role != "admin" and obj.owner_key != auth.user.username:
        raise HTTPException(status_code=404, detail="Not found.")
    return obj


@router.get("/startup-applications/")
def list_my_applications(
    request: Request,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("startuper", "admin")),
) -> dict:
    rows = (
        db.execute(
            select(StartupProjectApplication)
            .where(StartupProjectApplication.owner_key == auth.user.username)
            .order_by(StartupProjectApplication.updated_at.desc())
        )
        .scalars()
        .all()
    )
    out = [StartupApplicationOut.model_validate(r).model_dump() for r in rows]
    return paginate(out, request, default_page_size=30, max_page_size=100)


@router.post(
    "/startup-applications/",
    response_model=StartupApplicationOut,
    status_code=status.HTTP_201_CREATED,
)
def create_application(
    payload: StartupApplicationIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("startuper", "admin")),
) -> StartupApplicationOut:
    now = dt.datetime.now(dt.timezone.utc)
    obj = StartupProjectApplication(
        **payload.model_dump(),
        owner_key=auth.user.username,
        status="draft",
        created_at=now,
        updated_at=now,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return StartupApplicationOut.model_validate(obj)


@router.get("/startup-applications/{pk}/", response_model=StartupApplicationOut)
def get_application(
    pk: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("startuper", "admin")),
) -> StartupApplicationOut:
    obj = _get_owned_or_admin(db, pk, auth)
    return StartupApplicationOut.model_validate(obj)


@router.patch("/startup-applications/{pk}/", response_model=StartupApplicationOut)
def update_application(
    pk: int,
    payload: StartupApplicationPatch,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("startuper", "admin")),
) -> StartupApplicationOut:
    obj = _get_owned_or_admin(db, pk, auth)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    obj.updated_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
    db.refresh(obj)
    return StartupApplicationOut.model_validate(obj)


@router.delete("/startup-applications/{pk}/", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_application(
    pk: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("startuper", "admin")),
) -> None:
    obj = _get_owned_or_admin(db, pk, auth)
    if obj.status == "submitted" and auth.role != "admin":
        raise HTTPException(status_code=400, detail="Yuborilgan arizani o'chirib bo'lmaydi.")
    db.delete(obj)
    db.commit()


@router.post("/startup-applications/{pk}/submit/", response_model=StartupApplicationOut)
def submit_application(
    pk: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("startuper", "admin")),
) -> StartupApplicationOut:
    obj = db.execute(
        select(StartupProjectApplication).where(
            StartupProjectApplication.id == pk,
            StartupProjectApplication.owner_key == auth.user.username,
        )
    ).scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail="Not found.")
    if obj.status == "submitted":
        raise HTTPException(status_code=400, detail="Allaqachon yuborilgan.")
    obj.status = "submitted"
    obj.submitted_at = dt.datetime.now(dt.timezone.utc)
    obj.updated_at = obj.submitted_at
    db.commit()
    db.refresh(obj)
    return StartupApplicationOut.model_validate(obj)


@router.get("/startup-applications/admin/inbox/")
def admin_inbox(
    request: Request,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("admin")),
) -> dict:
    rows = (
        db.execute(
            select(StartupProjectApplication)
            .where(StartupProjectApplication.status == "submitted")
            .order_by(StartupProjectApplication.submitted_at.desc())
        )
        .scalars()
        .all()
    )
    out = [StartupApplicationOut.model_validate(r).model_dump() for r in rows]
    return paginate(out, request, default_page_size=30, max_page_size=100)
