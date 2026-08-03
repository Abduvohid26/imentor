"""Legacy / deprecated Django endpointlarining parity porti.

- `/api/prepared-content/` — v1'siz eski API, prod'da odatda o'chirilgan
  (`DJANGO_ALLOW_LEGACY_PREPARED_CONTENT_API=False`), auth'siz ishlaydi.
- `/api/v1/syllabuses/` — Django docstring'ida ochiq "Legacy: per-user
  syllabus (deprecated)" deb belgilangan, yangi katalog CourseSyllabus.
- `/api/v1/ai-jobs/{job_id}/` — Django'da Celery job-queue holatini
  so'raydi. FastAPI'da AI endpointlar sinxron (Faza 6/Startup-AI qarori),
  shuning uchun job hech qachon yaratilmaydi — bu endpoint doim
  "topilmadi" qaytaradi (arxitektura farqi, funksional yo'qotish emas).
"""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, require_roles
from app.core.config import get_settings
from app.core.db import get_db
from app.models.syllabus_document import SyllabusDocument
from app.schemas.prepared_content import PreparedContentLatestOut
from app.schemas.syllabus_document import SyllabusDocumentOut, SyllabusUpsertRequest

router = APIRouter()  # /api/v1 ostida ulanadi (syllabuses/, ai-jobs/)
root_router = APIRouter()  # /api ostida ulanadi (prepared-content/, v1'siz)

STAFF_ROLES = ("admin", "klinika_admin", "hodim", "startuper")


# ---------------- legacy prepared-content (v1'siz, auth'siz) ----------------


@root_router.get("/prepared-content/", response_model=PreparedContentLatestOut)
def legacy_get_prepared_content(
    owner_key: str = Query(default=""),
    kind: str = Query(default=""),
    topic_norm: str = Query(default=""),
    db: Session = Depends(get_db),
) -> PreparedContentLatestOut:
    settings = get_settings()
    if not settings.django_allow_legacy_prepared_content_api:
        raise HTTPException(
            status_code=403,
            detail="Legacy prepared-content API is disabled. Use /api/v1/prepared-content/.",
        )
    if not owner_key.strip() or not kind.strip() or not topic_norm.strip():
        raise HTTPException(status_code=400, detail="owner_key, kind, topic_norm are required.")

    from app.models.prepared_content import PreparedContent

    item = db.execute(
        select(PreparedContent)
        .where(
            PreparedContent.owner_key == owner_key.strip(),
            PreparedContent.kind == kind.strip(),
            PreparedContent.topic_norm == topic_norm.strip(),
        )
        .order_by(PreparedContent.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if item is None:
        return PreparedContentLatestOut(payload=None)
    return PreparedContentLatestOut(payload=item.payload)


# ---------------- legacy syllabuses (per-user, deprecated) ----------------


@router.get("/syllabuses/", response_model=list[SyllabusDocumentOut])
def list_syllabus_documents(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles(*STAFF_ROLES)),
) -> list[SyllabusDocumentOut]:
    rows = db.execute(
        select(SyllabusDocument).where(SyllabusDocument.owner_key == auth.user.username)
    ).scalars().all()
    return [SyllabusDocumentOut.model_validate(r, from_attributes=True) for r in rows]


@router.post("/syllabuses/", response_model=SyllabusDocumentOut, status_code=status.HTTP_201_CREATED)
def upsert_syllabus_document(
    payload: SyllabusUpsertRequest,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles(*STAFF_ROLES)),
) -> SyllabusDocumentOut:
    obj = db.execute(
        select(SyllabusDocument).where(
            SyllabusDocument.owner_key == auth.user.username,
            SyllabusDocument.external_id == payload.external_id,
        )
    ).scalar_one_or_none()
    if obj is None:
        obj = SyllabusDocument(
            owner_key=auth.user.username,
            external_id=payload.external_id,
            created_at=dt.datetime.now(dt.timezone.utc),
        )
        db.add(obj)
    obj.file_name = payload.file_name
    obj.topics = payload.topics
    db.commit()
    db.refresh(obj)
    return SyllabusDocumentOut.model_validate(obj, from_attributes=True)


@router.delete("/syllabuses/{pk}/", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_syllabus_document(
    pk: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles(*STAFF_ROLES)),
) -> None:
    obj = db.execute(
        select(SyllabusDocument).where(SyllabusDocument.id == pk, SyllabusDocument.owner_key == auth.user.username)
    ).scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail="Not found.")
    db.delete(obj)
    db.commit()


# ---------------- ai-jobs status (arxitektura farqi tufayli doim 404) ----------------


@router.get("/ai-jobs/{job_id}/")
def ai_job_status(job_id: str, auth: AuthContext = Depends(require_roles(*STAFF_ROLES))) -> dict:
    raise HTTPException(status_code=404, detail="Job topilmadi.")
