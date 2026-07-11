"""Jonli test sessiyasini yakunlash va draft javoblarni qayta ishlash."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from .models import LiveTestDraft, LiveTestSession, LiveTestSubmission


def _questions(session: LiveTestSession) -> list[dict]:
    payload = session.payload if isinstance(session.payload, dict) else {}
    raw = payload.get("questions", [])
    return raw if isinstance(raw, list) else []


def strip_questions_for_student(questions: list[dict]) -> list[dict]:
    """Talaba GET — javob kaliti va tushuntirish yuborilmaydi."""
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
    """Har bir savol uchun noto'g'ri variant indeksini qaytaradi."""
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


def finalize_live_test_session(session: LiveTestSession) -> int:
    """
    Draftlarni avtomatik topshirish va sessiyani yopish.
    select_for_update — parallel finalize so'rovlarida ikki marta yopilmasin.
    """
    with transaction.atomic():
        locked = LiveTestSession.objects.select_for_update().filter(pk=session.pk).first()
        if locked is None or locked.is_closed:
            return 0

        questions = _questions(locked)
        question_count = len(questions)
        wrong_template = build_wrong_answers(questions)

        submitted_keys = set(
            locked.submissions.exclude(participant_key="").values_list("participant_key", flat=True)
        )

        auto_count = 0
        for draft in locked.drafts.all():
            if draft.participant_key in submitted_keys:
                continue

            raw_answers = draft.answers if isinstance(draft.answers, list) else []
            first_name = (draft.first_name or "").strip() or "Noma'lum"
            last_name = (draft.last_name or "").strip() or "Talaba"

            if is_complete_draft(raw_answers, question_count):
                answers = [int(a) for a in raw_answers[:question_count]]
            else:
                answers = list(wrong_template)

            LiveTestSubmission.objects.create(
                session=locked,
                first_name=first_name,
                last_name=last_name,
                answers=answers,
                participant_key=draft.participant_key,
            )
            submitted_keys.add(draft.participant_key)
            auto_count += 1

        locked.is_closed = True
        locked.closed_at = timezone.now()
        locked.save(update_fields=["is_closed", "closed_at"])

    return auto_count
