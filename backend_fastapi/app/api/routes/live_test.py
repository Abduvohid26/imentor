from __future__ import annotations

import datetime as dt
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, require_roles
from app.core.db import get_db
from app.models.content import CourseSyllabus
from app.models.live_test import LiveTestDraft, LiveTestSession, LiveTestSubmission
from app.schemas.live_test import (
    LiveTestDraftUpsertRequest,
    LiveTestPublicOut,
    LiveTestSubmissionCreateRequest,
    LiveTestUpsertRequest,
)
from app.services import live_test_service as svc
from app.services.pagination import paginate

router = APIRouter()

STAFF_ROLES = ("admin", "klinika_admin", "hodim")


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
    subject_code = payload.subject_code.strip()

    if existing is None:
        existing = LiveTestSession(
            session_key=key,
            owner_key=owner,
            payload=body,
            subject_code=subject_code,
            is_closed=False,
            closed_at=None,
            created_at=dt.datetime.now(dt.timezone.utc),
        )
        db.add(existing)
    else:
        existing.owner_key = owner
        existing.payload = body
        # Bo'sh subject_code eskisini o'chirib yubormasin (masalan fon sync so'rovlarida).
        if subject_code:
            existing.subject_code = subject_code

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
    codes = {s.session.subject_code for s in rows if s.session.subject_code}
    subject_names = svc.subject_names_for_codes(db, codes)
    out = []
    for s in rows:
        payload = s.session.payload if isinstance(s.session.payload, dict) else {}
        questions = payload.get("questions", [])
        correct, total = svc.score_submission(questions if isinstance(questions, list) else [], s.answers)
        code = s.session.subject_code or ""
        out.append(
            {
                "id": s.id,
                "session_key": s.session.session_key,
                "topic": str(payload.get("topic") or ""),
                "subject_code": code,
                "subject_name": subject_names.get(code, ""),
                "first_name": s.first_name,
                "last_name": s.last_name,
                "answers": s.answers,
                "score": correct,
                "total": total,
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
    closed_ms = int(obj.closed_at.timestamp() * 1000) if obj.closed_at else None
    return LiveTestPublicOut(
        topic=payload.get("topic", ""),
        questions=questions,
        created_at_ms=created_ms,
        is_closed=bool(obj.is_closed),
        closed_at_ms=closed_ms,
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
    closed_ms = int(obj.closed_at.timestamp() * 1000) if obj.closed_at else None
    return {
        "ok": True,
        "is_closed": obj.is_closed,
        "closed_at_ms": closed_ms,
        "auto_submitted": auto_count,
        "submissions": svc.submissions_payload(obj),
    }


@router.get("/admin/live-test-stats/")
def admin_live_test_stats(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("admin")),
) -> dict:
    """Fan (va kafedra) kesimida — kim qancha jonli test yechgani statistikasi."""
    rows = (
        db.execute(
            select(
                LiveTestSession.subject_code,
                func.count(LiveTestSubmission.id).label("submission_count"),
                func.count(func.distinct(LiveTestSubmission.student_id)).label("student_count"),
            )
            .join(LiveTestSubmission, LiveTestSubmission.session_id == LiveTestSession.id)
            .where(LiveTestSession.subject_code != "")
            .group_by(LiveTestSession.subject_code)
            .order_by(func.count(LiveTestSubmission.id).desc())
        )
        .all()
    )
    codes = [r.subject_code for r in rows]
    subjects = {
        s.subject_code: {"subject_name": s.subject_name, "department": s.department.name if s.department else ""}
        for s in db.execute(
            select(CourseSyllabus).where(CourseSyllabus.subject_code.in_(codes))
        ).scalars()
    }

    avg_scores: dict[str, list[float]] = {}
    subs = db.execute(
        select(LiveTestSubmission).join(LiveTestSession).where(LiveTestSession.subject_code != "")
    ).scalars().all()
    for sub in subs:
        payload = sub.session.payload if isinstance(sub.session.payload, dict) else {}
        questions = payload.get("questions", [])
        correct, total = svc.score_submission(questions if isinstance(questions, list) else [], sub.answers)
        if total:
            avg_scores.setdefault(sub.session.subject_code, []).append(correct / total * 100)

    data = []
    for r in rows:
        code = r.subject_code
        meta = subjects.get(code, {"subject_name": "", "department": ""})
        scores = avg_scores.get(code, [])
        data.append(
            {
                "subject_code": code,
                "subject_name": meta["subject_name"],
                "department": meta["department"],
                "submission_count": r.submission_count,
                "student_count": r.student_count,
                "avg_score_pct": round(sum(scores) / len(scores), 1) if scores else None,
            }
        )
    return {"results": data}


@router.get("/admin/live-test-sessions/")
def admin_live_test_sessions(
    subject_code: str = "",
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("admin")),
) -> dict:
    """Fan ichidagi har bir jonli test (mavzu + sana) — nechta talaba yechgani bilan."""
    query = select(
        LiveTestSession.session_key,
        LiveTestSession.payload,
        LiveTestSession.created_at,
        LiveTestSession.is_closed,
        func.count(LiveTestSubmission.id).label("submission_count"),
    ).join(LiveTestSubmission, LiveTestSubmission.session_id == LiveTestSession.id)
    if subject_code:
        query = query.where(LiveTestSession.subject_code == subject_code)
    query = query.group_by(
        LiveTestSession.session_key, LiveTestSession.payload, LiveTestSession.created_at, LiveTestSession.is_closed
    ).order_by(LiveTestSession.created_at.desc())
    rows = db.execute(query).all()

    data = []
    for r in rows:
        payload = r.payload if isinstance(r.payload, dict) else {}
        data.append(
            {
                "session_key": r.session_key,
                "topic": str(payload.get("topic") or ""),
                "created_at_ms": int(r.created_at.timestamp() * 1000),
                "is_closed": bool(r.is_closed),
                "submission_count": r.submission_count,
            }
        )
    return {"results": data}


@router.get("/admin/live-test-submissions/")
def admin_live_test_submissions(
    request: Request,
    subject_code: str = "",
    session_key: str = "",
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles("admin")),
) -> dict:
    """Har bir talabaning jonli test (QR) topshirig'i — sahifalangan, fan/sessiya bo'yicha filtrlanadi."""
    query = select(LiveTestSubmission).join(LiveTestSession).order_by(LiveTestSubmission.submitted_at.desc())
    if subject_code:
        query = query.where(LiveTestSession.subject_code == subject_code)
    if session_key:
        query = query.where(LiveTestSession.session_key == session_key)
    rows = db.execute(query).scalars().all()

    codes = {s.session.subject_code for s in rows if s.session.subject_code}
    subject_names = svc.subject_names_for_codes(db, codes)

    def _map(sub: LiveTestSubmission) -> dict:
        payload = sub.session.payload if isinstance(sub.session.payload, dict) else {}
        questions = payload.get("questions", [])
        correct, total = svc.score_submission(questions if isinstance(questions, list) else [], sub.answers)
        code = sub.session.subject_code or ""
        return {
            "id": sub.id,
            "session_key": sub.session.session_key,
            "topic": str(payload.get("topic") or ""),
            "subject_code": code,
            "subject_name": subject_names.get(code, ""),
            "student_id": sub.student_id or "",
            "first_name": sub.first_name,
            "last_name": sub.last_name,
            "score": correct,
            "total": total,
            "submitted_at": sub.submitted_at.isoformat(),
        }

    page = paginate(rows, request, default_page_size=50, max_page_size=200)
    page["results"] = [_map(r) for r in page["results"]]
    return page
