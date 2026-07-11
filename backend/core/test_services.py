"""Unit testlar — servislar va yordamchi funksiyalar."""

from __future__ import annotations

from unittest.mock import patch

from django.contrib.auth.models import Group, User
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from core.ai_jobs import (
    create_ai_job,
    get_ai_job,
    mark_ai_job_completed,
    mark_ai_job_failed,
    wait_for_ai_job,
)
from core.education_ai_utils import clip_education_messages
from core.live_test_service import (
    build_wrong_answers,
    finalize_live_test_session,
    is_complete_draft,
)
from core.models import LiveTestDraft, LiveTestSession
from core.openai_client import (
    OpenAiClientError,
    _extract_text,
    _is_rate_limited,
    resolve_openai_model,
)
from core.permissions import resolve_user_role, resolve_user_role_from_db, user_has_admin_db_role


class AiJobsTests(TestCase):
    def setUp(self) -> None:
        cache.clear()

    def test_create_and_complete_job(self) -> None:
        job_id = create_ai_job(user_id=42, kind="education_completion")
        self.assertTrue(job_id.startswith("ai_"))
        job = get_ai_job(job_id)
        self.assertIsNotNone(job)
        assert job is not None
        self.assertEqual(job["status"], "pending")
        mark_ai_job_completed(job_id, {"content": "demo"})
        done = get_ai_job(job_id)
        assert done is not None
        self.assertEqual(done["status"], "completed")
        self.assertEqual(done["result"]["content"], "demo")

    def test_mark_failed_job(self) -> None:
        job_id = create_ai_job(user_id=1, kind="x")
        mark_ai_job_failed(job_id, "xato")
        job = get_ai_job(job_id)
        assert job is not None
        self.assertEqual(job["status"], "failed")
        self.assertEqual(job["error"], "xato")

    def test_wait_for_ai_job_completes(self) -> None:
        job_id = create_ai_job(user_id=5, kind="x")

        def _complete_later() -> None:
            mark_ai_job_completed(job_id, {"ok": True})

        with patch("core.ai_jobs.time.sleep", side_effect=lambda _: _complete_later()):
            job = wait_for_ai_job(job_id, timeout=1, interval=0.01)
        self.assertEqual(job["status"], "completed")

    def test_wait_for_ai_job_timeout(self) -> None:
        job_id = create_ai_job(user_id=5, kind="x")
        with patch("core.ai_jobs.time.sleep"):
            with self.assertRaises(TimeoutError):
                wait_for_ai_job(job_id, timeout=0.01, interval=0.001)


class OpenAiClientTests(TestCase):
    def test_resolve_openai_model_aliases(self) -> None:
        self.assertEqual(resolve_openai_model("deepseek-chat"), "gpt-4o")
        self.assertEqual(resolve_openai_model("gpt-4o-mini"), "gpt-4o-mini")
        self.assertEqual(resolve_openai_model(""), "gpt-4o")

    def test_extract_text_success(self) -> None:
        text = _extract_text({"choices": [{"message": {"content": " Salom "}}]})
        self.assertEqual(text, "Salom")

    def test_extract_text_empty_raises(self) -> None:
        with self.assertRaises(OpenAiClientError):
            _extract_text({"choices": [{"message": {"content": ""}}]})

    def test_is_rate_limited(self) -> None:
        self.assertTrue(_is_rate_limited("HTTP 429: rate limit"))
        self.assertFalse(_is_rate_limited("HTTP 500"))


class EducationAiUtilsTests(TestCase):
    def test_clip_education_messages_filters_roles(self) -> None:
        out = clip_education_messages(
            [
                {"role": "user", "content": "Salom"},
                {"role": "tool", "content": "skip"},
                {"role": "assistant", "content": "Javob"},
            ]
        )
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]["role"], "user")


class LiveTestServiceTests(TestCase):
    def test_strip_questions_for_student(self) -> None:
        from core.live_test_service import strip_questions_for_student

        raw = [
            {
                'question': 'Q1',
                'options': ['a', 'b'],
                'correctOptionIndex': 1,
                'explanation': 'secret',
            }
        ]
        stripped = strip_questions_for_student(raw)
        self.assertEqual(stripped[0]['question'], 'Q1')
        self.assertEqual(stripped[0]['options'], ['a', 'b'])
        self.assertNotIn('correctOptionIndex', stripped[0])
        self.assertNotIn('explanation', stripped[0])

    def test_build_wrong_answers_picks_non_correct(self) -> None:
        wrong = build_wrong_answers(
            [{"correctOptionIndex": 2, "options": ["A", "B", "C", "D"]}]
        )
        self.assertEqual(wrong, [0])

    def test_is_complete_draft(self) -> None:
        self.assertTrue(is_complete_draft([0, 1], 2))
        self.assertFalse(is_complete_draft([0], 2))

    def test_finalize_live_test_session_closes_and_auto_submits(self) -> None:
        session = LiveTestSession.objects.create(
            session_key="lts_unit_1",
            owner_key="998901112233",
            payload={
                "topic": "T",
                "questions": [
                    {
                        "question": "Q",
                        "options": ["A", "B", "C", "D", "E"],
                        "correctOptionIndex": 1,
                    }
                ],
            },
        )
        LiveTestDraft.objects.create(
            session=session,
            participant_key="p1",
            first_name="Ali",
            last_name="Vali",
            answers=[1],
        )
        LiveTestDraft.objects.create(
            session=session,
            participant_key="p2",
            first_name="Incomplete",
            last_name="Student",
            answers=[-1],
        )
        count = finalize_live_test_session(session)
        self.assertEqual(count, 2)
        session.refresh_from_db()
        self.assertTrue(session.is_closed)
        self.assertEqual(session.submissions.count(), 2)


class PermissionsTests(TestCase):
    def test_resolve_user_role_from_db(self) -> None:
        user = User.objects.create_user(username="998901112200", password="x")
        hodim, _ = Group.objects.get_or_create(name="hodim")
        user.groups.add(hodim)
        self.assertEqual(resolve_user_role_from_db(user), "hodim")
        self.assertFalse(user_has_admin_db_role(user))

    def test_admin_role_from_db_only(self) -> None:
        user = User.objects.create_user(username="998901112201", password="x")
        admin, _ = Group.objects.get_or_create(name="admin")
        user.groups.add(admin)
        self.assertTrue(user_has_admin_db_role(user))
        self.assertEqual(resolve_user_role(user), "admin")


class PaginationHelperTests(TestCase):
    def test_paginate_items_caps_page_size(self) -> None:
        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory

        from core.pagination import paginate_items

        factory = APIRequestFactory()
        req = Request(factory.get("/x/?page=1&page_size=999"))
        out = paginate_items(list(range(10)), req, default_page_size=50, max_page_size=5)
        self.assertEqual(out["page_size"], 5)
        self.assertEqual(len(out["results"]), 5)

    def test_paginate_items_invalid_page_defaults(self) -> None:
        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory

        from core.pagination import paginate_items

        factory = APIRequestFactory()
        req = Request(factory.get("/x/?page=abc&page_size=-1"))
        out = paginate_items([1, 2, 3], req, default_page_size=50, max_page_size=200)
        self.assertEqual(out["page"], 1)
        self.assertEqual(out["page_size"], 50)


class ContentCatalogServiceTests(TestCase):
    def test_catalog_verification_code_stable(self) -> None:
        from datetime import timedelta

        from core.content_catalog_service import catalog_document_id, catalog_verification_code
        from core.models import PreparedContent

        obj = PreparedContent.objects.create(
            owner_key="998901114080",
            kind=PreparedContent.KIND_CASE,
            topic="Keys",
            topic_norm="keys",
            payload={},
        )
        PreparedContent.objects.filter(pk=obj.pk).update(
            created_at=timezone.now() - timedelta(hours=2)
        )
        obj.refresh_from_db()
        code1 = catalog_verification_code(obj)
        code2 = catalog_verification_code(obj)
        self.assertEqual(code1, code2)
        self.assertTrue(catalog_document_id(obj).startswith("IM-"))
