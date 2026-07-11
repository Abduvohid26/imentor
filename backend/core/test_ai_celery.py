"""AI + Celery integratsiya testlari."""

from __future__ import annotations

from unittest.mock import patch

from django.contrib.auth.models import Group, User
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient


@override_settings(
    SECURE_SSL_REDIRECT=False,
    OPENAI_API_KEY="sk-test-key",
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
)
class AiCeleryApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        cache.clear()

    def _register_hodim(self, phone: str = "998901112300") -> str:
        Group.objects.get_or_create(name="hodim")
        resp = self.client.post(
            "/api/v1/auth/local-login/",
            {
                "phone_digits": phone,
                "password": "StrongPass123",
                "role": "hodim",
                "register": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        return resp.json()["access"]

    def _register_startuper(self, phone: str = "998901112301") -> str:
        Group.objects.get_or_create(name="startuper")
        resp = self.client.post(
            "/api/v1/auth/local-login/",
            {
                "phone_digits": phone,
                "password": "StrongPass123",
                "role": "startuper",
                "register": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        return resp.json()["access"]

    @patch("core.tasks._http_post")
    def test_education_ai_completion_via_celery(self, mock_http) -> None:
        mock_http.return_value = {"choices": [{"message": {"content": "AI javob matni"}}]}
        access = self._register_hodim()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        resp = self.client.post(
            "/api/v1/education-ai/completion/",
            {
                "model": "gpt-4o",
                "messages": [{"role": "user", "content": "Test savol"}],
                "max_tokens": 512,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.json()["content"], "AI javob matni")
        mock_http.assert_called_once()

    @override_settings(OPENAI_API_KEY="")
    def test_education_ai_missing_api_key(self) -> None:
        access = self._register_hodim("998901112302")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        resp = self.client.post(
            "/api/v1/education-ai/completion/",
            {"messages": [{"role": "user", "content": "x"}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 503)

    def test_education_ai_requires_auth(self) -> None:
        resp = self.client.post(
            "/api/v1/education-ai/completion/",
            {"messages": [{"role": "user", "content": "x"}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 401)

    @patch("core.tasks.generate_openai_text")
    def test_startup_questionnaire_via_celery(self, mock_gen) -> None:
        mock_gen.return_value = '{"questions": [{"id": "q1", "prompt": "Savol?"}]}'
        access = self._register_startuper()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        resp = self.client.post(
            "/api/v1/startup-ai/questionnaire/",
            {
                "project_title": "Demo loyiha",
                "summary": "Qisqa",
                "full_description": "To'liq tavsif matni",
                "language": "uz",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIn("questions", resp.json())

    @patch("core.tasks.generate_openai_text")
    def test_startup_coach_reply_via_celery(self, mock_gen) -> None:
        mock_gen.return_value = "Murabbiy javobi"
        access = self._register_startuper("998901112303")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        resp = self.client.post(
            "/api/v1/startup-ai/coach-reply/",
            {
                "messages": [{"role": "user", "content": "Maslahat bering"}],
                "ctx": {"title": "Loyiha", "project_domain": "startup"},
                "language": "uz",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.json()["reply"], "Murabbiy javobi")

    def test_ai_job_status_endpoint_owner_only(self) -> None:
        from core.ai_jobs import create_ai_job, mark_ai_job_completed

        owner = User.objects.create_user(username="998901112304", password="StrongPass123")
        User.objects.create_user(username="998901112305", password="StrongPass123")
        job_id = create_ai_job(user_id=owner.pk, kind="education_completion")
        mark_ai_job_completed(job_id, {"content": "secret"})

        hodim_group, _ = Group.objects.get_or_create(name="hodim")
        owner.groups.add(hodim_group)
        login = self.client.post(
            "/api/v1/auth/local-login/",
            {"phone_digits": "998901112304", "password": "StrongPass123"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.json()['access']}")
        ok = self.client.get(f"/api/v1/ai-jobs/{job_id}/")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.json()["status"], "completed")

        other = User.objects.get(username="998901112305")
        other.groups.add(hodim_group)
        other_login = self.client.post(
            "/api/v1/auth/local-login/",
            {"phone_digits": "998901112305", "password": "StrongPass123"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {other_login.json()['access']}")
        denied = self.client.get(f"/api/v1/ai-jobs/{job_id}/")
        self.assertEqual(denied.status_code, 403)

    @patch("core.tasks.generate_openai_text")
    def test_startup_twenty_criteria_via_celery(self, mock_gen) -> None:
        mock_gen.return_value = '{"criteria": [{"id": "c1", "score": 8}]}'
        access = self._register_startuper("998901114070")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        resp = self.client.post(
            "/api/v1/startup-ai/twenty-criteria/",
            {
                "project_title": "Demo",
                "summary": "Qisqa",
                "full_description": "To'liq",
                "language": "uz",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIn("criteria", resp.json())

    @patch("core.tasks.generate_openai_text")
    def test_startup_innovation_pack_via_celery(self, mock_gen) -> None:
        mock_gen.return_value = '{"sections": [{"title": "Bozor"}]}'
        access = self._register_startuper("998901114071")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        resp = self.client.post(
            "/api/v1/startup-ai/innovation-pack/",
            {
                "project_title": "Demo",
                "summary": "Qisqa",
                "full_description": "To'liq",
                "project_domain": "startup",
                "language": "uz",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIn("sections", resp.json())

    @patch("core.tasks._http_post")
    def test_education_ai_task_failure_returns_502(self, mock_http) -> None:
        from core.openai_client import OpenAiClientError

        mock_http.side_effect = OpenAiClientError("OpenAI down")
        access = self._register_hodim("998901112306")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        resp = self.client.post(
            "/api/v1/education-ai/completion/",
            {"messages": [{"role": "user", "content": "x"}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 502)
