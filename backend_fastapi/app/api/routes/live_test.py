from __future__ import annotations

import datetime as dt
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, require_roles
from app.core.db import get_db
from app.models.live_test import LiveTestDraft, LiveTestSession, LiveTestSubmission
from app.schemas.live_test import (
    LiveTestDraftUpsertRequest,
    LiveTestPublicOut,
    LiveTestSubmissionCreateRequest,
    LiveTestUpsertRequest,
)
from app.services import live_test_service as svc

router = APIRouter()

STAFF_ROLES = ("admin", "klinika_admin", "hodim", "startuper")


def _get_session(db: Session, session_key: str) -> LiveTestSession | None:
    return db.execute(
        select(LiveTestSession).where(LiveTestSession.session_key == session_key.strip())
    ).scalar_one_or_none()


@router.post("/live-tests/")
def upsert_live_test(
    payload: LiveTestUpsertRequest,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles(*STAFF_ROLES)),
) -> dict:
    key = payload.session_key.strip()
    owner = auth.user.username

    if not key:
        for _ in range(5):
            candidate = f"lts_{secrets.token_urlsafe(16)}"
            if _get_session(db, candidate) is None:
                key = candidate
                break
        else:
            raise HTTPException(status_code=503, detail="Could not allocate session key.")

    existing = _get_session(db, key)
    if existing and existing.owner_key != owner:
        raise HTTPException(status_code=409, detail="Session key already in use.")

    created_ms = payload.created_at_ms
    if created_ms is None:
        created_ms = int(dt.datetime.now(dt.timezone.utc).timestamp() * 1000)

    body = {
        "topic": payload.topic.strip(),
        "questions": payload.questions,
        "createdAt": created_ms,
    }

    if existing is None:
        existing = LiveTestSession(
            session_key=key,
            owner_key=owner,
            payload=body,
            is_closed=False,
            closed_at=None,
            created_at=dt.datetime.now(dt.timezone.utc),
        )
        db.add(existing)
    else:
        existing.owner_key = owner
        existing.payload = body

    db.commit()
    db.refresh(existing)
    return {"ok": True, "session_key": existing.session_key}


@router.get("/live-tests/my-submissions/")
def my_submissions(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("student")),
) -> list[dict]:
    student_id = auth.student_id
    if not student_id:
        raise HTTPException(status_code=403, detail="Talaba ID topilmadi.")
    rows = (
        db.execute(
            select(LiveTestSubmission)
            .where(LiveTestSubmission.student_id == student_id)
            .order_by(LiveTestSubmission.submitted_at.desc())
            .limit(100)
        )
        .scalars()
        .all()
    )
    out = []
    for s in rows:
        payload = s.session.payload if isinstance(s.session.payload, dict) else {}
        out.append(
            {
                "id": s.id,
                "session_key": s.session.session_key,
                "topic": str(payload.get("topic") or ""),
                "first_name": s.first_name,
                "last_name": s.last_name,
                "answers": s.answers,
                "submitted_at": s.submitted_at.isoformat(),
                "is_closed": bool(s.session.is_closed),
            }
        )
    return out


@router.get("/live-tests/{session_key}/", response_model=LiveTestPublicOut)
def get_public_live_test(session_key: str, db: Session = Depends(get_db)) -> LiveTestPublicOut:
    obj = _get_session(db, session_key)
    if obj is None:
        raise HTTPException(status_code=404, detail="Not found.")
    payload = obj.payload if isinstance(obj.payload, dict) else {}
    created_ms = payload.get("createdAt")
    if created_ms is None:
        created_ms = int(obj.created_at.timestamp() * 1000)
    raw_questions = payload.get("questions", [])
    questions = svc.strip_questions_for_student(raw_questions) if isinstance(raw_questions, list) else []
    return LiveTestPublicOut(
        topic=payload.get("topic", ""),
        questions=questions,
        created_at_ms=created_ms,
        is_closed=bool(obj.is_closed),
    )


@router.get("/live-tests/{session_key}/submissions/")
def list_submissions(
    session_key: str,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles(*STAFF_ROLES)),
) -> list[dict]:
    obj = db.execute(
        select(LiveTestSession).where(
            LiveTestSession.session_key == session_key.strip(),
            LiveTestSession.owner_key == auth.user.username,
        )
    ).scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail="Not found.")
    return svc.submissions_payload(obj)


@router.post("/live-tests/{session_key}/submissions/", status_code=status.HTTP_201_CREATED)
def submit_answer(
    session_key: str,
    payload: LiveTestSubmissionCreateRequest,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("student")),
) -> dict:
    obj = _get_session(db, session_key)
    if obj is None:
        raise HTTPException(status_code=404, detail="Not found.")
    if obj.is_closed:
        raise HTTPException(status_code=403, detail="Test sessiyasi yakunlangan.")

    student_id = auth.student_id
    if not student_id:
        raise HTTPException(status_code=403, detail="Talaba ID topilmadi. OnlineTest orqali qayta kiring.")

    participant_key = payload.participant_key.strip()
    if any(s.student_id == student_id for s in obj.submissions):
        return {"ok": True, "already_submitted": True}
    if participant_key and any(s.participant_key == participant_key for s in obj.submissions):
        return {"ok": True, "already_submitted": True}

    first_name = payload.first_name.strip() or (auth.user.first_name or "").strip() or "Talaba"
    last_name = payload.last_name.strip() or (auth.user.last_name or "").strip() or student_id

    sub = LiveTestSubmission(
        session_id=obj.id,
        participant_key=participant_key,
        student_id=student_id,
        first_name=first_name,
        last_name=last_name,
        answers=list(payload.answers),
        submitted_at=dt.datetime.now(dt.timezone.utc),
    )
    db.add(sub)
    try:
        db.commit()
    except Exception:
        db.rollback()
        return {"ok": True, "already_submitted": True}

    if participant_key:
        drafts = [d for d in obj.drafts if d.participant_key == participant_key]
        for d in drafts:
            db.delete(d)
        db.commit()

    return {"ok": True}


@router.post("/live-tests/{session_key}/drafts/")
def upsert_draft(
    session_key: str,
    payload: LiveTestDraftUpsertRequest,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("student")),
) -> dict:
    obj = _get_session(db, session_key)
    if obj is None:
        raise HTTPException(status_code=404, detail="Not found.")
    if obj.is_closed:
        raise HTTPException(status_code=403, detail="Test sessiyasi yakunlangan.")

    student_id = auth.student_id
    if student_id and any(s.student_id == student_id for s in obj.submissions):
        return {"ok": True, "already_submitted": True}

    participant_key = payload.participant_key.strip()
    if not participant_key:
        raise HTTPException(status_code=400, detail="participant_key required.")
    if any(s.participant_key == participant_key for s in obj.submissions):
        return {"ok": True, "already_submitted": True}

    draft = db.execute(
        select(LiveTestDraft).where(
            LiveTestDraft.session_id == obj.id,
            LiveTestDraft.participant_key == participant_key,
        )
    ).scalar_one_or_none()
    if draft is None:
        draft = LiveTestDraft(
            session_id=obj.id,
            participant_key=participant_key,
            updated_at=dt.datetime.now(dt.timezone.utc),
        )
        db.add(draft)
    draft.first_name = payload.first_name.strip()
    draft.last_name = payload.last_name.strip()
    draft.answers = list(payload.answers or [])
    draft.updated_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
    return {"ok": True}


@router.post("/live-tests/{session_key}/finalize/")
def finalize(
    session_key: str,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles(*STAFF_ROLES)),
) -> dict:
    obj = db.execute(
        select(LiveTestSession).where(
            LiveTestSession.session_key == session_key.strip(),
            LiveTestSession.owner_key == auth.user.username,
        )
    ).scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail="Not found.")
    auto_count = svc.finalize_live_test_session(db, obj)
    return {
        "ok": True,
        "is_closed": obj.is_closed,
        "auto_submitted": auto_count,
        "submissions": svc.submissions_payload(obj),
    }
