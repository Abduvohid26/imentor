from __future__ import annotations

import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.live_test import LiveTestDraft, LiveTestSession, LiveTestSubmission


def questions_of(session: LiveTestSession) -> list[dict]:
    payload = session.payload if isinstance(session.payload, dict) else {}
    raw = payload.get("questions", [])
    return raw if isinstance(raw, list) else []


def strip_questions_for_student(questions: list[dict]) -> list[dict]:
    stripped: list[dict] = []
    for q in questions:
        if not isinstance(q, dict):
            continue
        item: dict = {
            "question": q.get("question", ""),
            "options": q.get("options", []) if isinstance(q.get("options"), list) else [],
        }
        refs = q.get("references")
        if isinstance(refs, list) and refs:
            item["references"] = refs
        stripped.append(item)
    return stripped


def build_wrong_answers(questions: list[dict]) -> list[int]:
    answers: list[int] = []
    for q in questions:
        if not isinstance(q, dict):
            answers.append(0)
            continue
        correct = int(q.get("correctOptionIndex", 0))
        options = q.get("options", [])
        count = len(options) if isinstance(options, list) else 0
        if count <= 0:
            answers.append(0)
            continue
        wrong = 0
        for idx in range(count):
            if idx != correct:
                wrong = idx
                break
        answers.append(wrong)
    return answers


def is_complete_draft(answers: list, question_count: int) -> bool:
    if question_count <= 0:
        return False
    if not isinstance(answers, list) or len(answers) != question_count:
        return False
    return all(isinstance(a, int) and a >= 0 for a in answers)


def submissions_payload(session: LiveTestSession) -> list[dict]:
    return [
        {
            "first_name": s.first_name,
            "last_name": s.last_name,
            "student_id": s.student_id or "",
            "answers": s.answers,
            "submitted_at": s.submitted_at.isoformat(),
        }
        for s in session.submissions
    ]


def finalize_live_test_session(db: Session, session: LiveTestSession) -> int:
    """Draftlarni avtomatik topshirish va sessiyani yopish (transaction ichida)."""
    locked = db.execute(
        select(LiveTestSession).where(LiveTestSession.id == session.id).with_for_update()
    ).scalar_one_or_none()
    if locked is None or locked.is_closed:
        return 0

    questions = questions_of(locked)
    question_count = len(questions)
    wrong_template = build_wrong_answers(questions)

    submitted_keys = {s.participant_key for s in locked.submissions if s.participant_key}

    auto_count = 0
    for draft in locked.drafts:
        if draft.participant_key in submitted_keys:
            continue

        raw_answers = draft.answers if isinstance(draft.answers, list) else []
        first_name = (draft.first_name or "").strip() or "Noma'lum"
        last_name = (draft.last_name or "").strip() or "Talaba"

        if is_complete_draft(raw_answers, question_count):
            answers = [int(a) for a in raw_answers[:question_count]]
        else:
            answers = list(wrong_template)

        sub = LiveTestSubmission(
            session_id=locked.id,
            first_name=first_name,
            last_name=last_name,
            answers=answers,
            participant_key=draft.participant_key,
            submitted_at=dt.datetime.now(dt.timezone.utc),
        )
        db.add(sub)
        submitted_keys.add(draft.participant_key)
        auto_count += 1

    locked.is_closed = True
    locked.closed_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
    db.refresh(locked)
    return auto_count
