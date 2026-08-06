from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, require_roles
from app.core.db import get_db
from app.models.content import CourseSyllabus
from app.models.prepared_content import PreparedContent
from app.schemas.prepared_content import (
    PreparedContentIn,
    PreparedContentLatestOut,
    PreparedContentOut,
    PreparedContentSummaryOut,
)
from app.services import content_catalog as cc
from app.services.pagination import paginate

router = APIRouter()

STAFF_ROLES = ("admin", "klinika_admin", "hodim")


@router.get("/prepared-content/mine/")
def list_my_prepared_content(
    request: Request,
    kind: str,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles(*STAFF_ROLES)),
) -> dict:
    """Joriy foydalanuvchining shu turdagi (masalan `lecture`) barcha
    saqlangan yozuvlari — "Baza" (tarix) sahifasi uchun. Server'da saqlanadi,
    shuning uchun brauzer/qurilma almashtirilsa ham yo'qolmaydi."""
    if not kind.strip():
        raise HTTPException(status_code=400, detail="kind majburiy.")
    rows = db.execute(
        select(PreparedContent)
        .where(PreparedContent.owner_key == auth.user.username, PreparedContent.kind == kind.strip())
        .order_by(PreparedContent.created_at.desc())
    ).scalars().all()
    out = [
        PreparedContentSummaryOut(
            id=r.id,
            kind=r.kind,
            topic=r.topic,
            topic_norm=r.topic_norm,
            subject_name=r.subject_name,
            created_at=r.created_at,
        ).model_dump()
        for r in rows
    ]
    return paginate(out, request, default_page_size=100, max_page_size=300)


@router.get("/prepared-content/{pk}/")
def get_prepared_content_by_id(
    pk: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles(*STAFF_ROLES)),
) -> PreparedContentOut:
    """Bitta yozuvni to'liq payload bilan olish — "Baza"dan tanlangan
    eski ma'ruzani ochish uchun."""
    item = db.execute(
        select(PreparedContent).where(PreparedContent.id == pk, PreparedContent.owner_key == auth.user.username)
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Topilmadi.")
    return _out(item)


def _out(item: PreparedContent) -> PreparedContentOut:
    return PreparedContentOut(
        id=item.id,
        owner_key=item.owner_key,
        kind=item.kind,
        topic=item.topic,
        topic_norm=item.topic_norm,
        author_display_name=item.author_display_name,
        subject_name=item.subject_name,
        subject_code=item.subject_code,
        variant_label=item.variant_label,
        topic_code=item.topic_code,
        payload=item.payload,
        created_at=item.created_at,
    )


@router.get("/prepared-content/", response_model=PreparedContentLatestOut)
def get_latest_prepared_content(
    kind: str,
    topic_norm: str,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles(*STAFF_ROLES)),
) -> PreparedContentLatestOut:
    if not kind.strip() or not topic_norm.strip():
        raise HTTPException(status_code=400, detail="kind, topic_norm are required.")
    item = db.execute(
        select(PreparedContent)
        .where(
            PreparedContent.owner_key == auth.user.username,
            PreparedContent.kind == kind,
            PreparedContent.topic_norm == topic_norm.strip().lower(),
        )
        .order_by(PreparedContent.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if item is None:
        return PreparedContentLatestOut(payload=None)
    return PreparedContentLatestOut(payload=item.payload)


@router.post("/prepared-content/", response_model=PreparedContentOut, status_code=status.HTTP_201_CREATED)
def create_prepared_content(
    payload: PreparedContentIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles(*STAFF_ROLES)),
) -> PreparedContentOut:
    topic_norm = (payload.topic_norm or "").strip().lower() or payload.topic.lower()

    syllabus = None
    subject_name = payload.subject_name
    subject_code = payload.subject_code.strip()
    if subject_code:
        syllabus = db.execute(
            select(CourseSyllabus).where(CourseSyllabus.subject_code == subject_code)
        ).scalar_one_or_none()
        if syllabus:
            subject_name = syllabus.subject_name
            subject_code = subject_code or syllabus.subject_code

    variant_label = payload.variant_label.strip()
    topic_code = payload.topic_code.strip()
    if not variant_label or not topic_code:
        parsed = cc.parse_topic_norm(topic_norm)
        variant_label = variant_label or parsed.get("variant_label", "")
        topic_code = topic_code or parsed.get("topic_code", "")

    obj = PreparedContent(
        owner_key=auth.user.username,
        kind=payload.kind,
        topic=payload.topic,
        topic_norm=topic_norm,
        author_display_name=payload.author_display_name,
        subject_name=subject_name,
        subject_code=subject_code,
        variant_label=variant_label[:128],
        topic_code=topic_code[:32],
        syllabus_id=syllabus.id if syllabus else None,
        payload=payload.payload,
        created_at=dt.datetime.now(dt.timezone.utc),
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _out(obj)


@router.delete("/prepared-content/{pk}/", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_prepared_content(
    pk: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles(*STAFF_ROLES)),
) -> None:
    item = db.execute(
        select(PreparedContent).where(PreparedContent.id == pk, PreparedContent.owner_key == auth.user.username)
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Topilmadi.")
    db.delete(item)
    db.commit()
