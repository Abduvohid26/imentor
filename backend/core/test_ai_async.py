"""ai_async moduli unit testlari."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from django.test import TestCase
from rest_framework import status

from core.ai_async import ai_job_status_response, dispatch_ai_job
from core.ai_jobs import create_ai_job


class AiAsyncDispatchTests(TestCase):
    @patch("core.ai_async.wait_for_ai_job")
    @patch("core.ai_async.create_ai_job", return_value="job_edu")
    def test_dispatch_education_completion_success(self, _mock_create, mock_wait) -> None:
        mock_wait.return_value = {"status": "completed", "result": {"content": "AI matn"}}
        task = MagicMock()
        resp = dispatch_ai_job(
            user_id=1,
            kind="education_completion",
            payload={"messages": []},
            task=task,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["content"], "AI matn")
        task.delay.assert_called_once_with("job_edu", {"messages": []})

    @patch("core.ai_async.wait_for_ai_job")
    @patch("core.ai_async.create_ai_job", return_value="job_startup")
    def test_dispatch_startup_coach_reply_success(self, _mock_create, mock_wait) -> None:
        mock_wait.return_value = {"status": "completed", "result": {"reply": "Salom"}}
        task = MagicMock()
        resp = dispatch_ai_job(
            user_id=2,
            kind="startup_coach_reply",
            payload={"text": "x"},
            task=task,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["reply"], "Salom")

    @patch("core.ai_async.wait_for_ai_job")
    @patch("core.ai_async.create_ai_job", return_value="job_fail")
    def test_dispatch_failed_job(self, _mock_create, mock_wait) -> None:
        mock_wait.return_value = {"status": "failed", "error": "OpenAI xato"}
        task = MagicMock()
        resp = dispatch_ai_job(user_id=1, kind="generic", payload={}, task=task)
        self.assertEqual(resp.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertIn("OpenAI xato", resp.data["detail"])

    @patch("core.ai_async.wait_for_ai_job", side_effect=TimeoutError("AI job vaqti tugadi."))
    @patch("core.ai_async.create_ai_job", return_value="job_timeout")
    def test_dispatch_timeout(self, _mock_create, _mock_wait) -> None:
        task = MagicMock()
        resp = dispatch_ai_job(user_id=1, kind="generic", payload={}, task=task)
        self.assertEqual(resp.status_code, status.HTTP_504_GATEWAY_TIMEOUT)


class AiAsyncStatusTests(TestCase):
    def test_status_not_found(self) -> None:
        resp = ai_job_status_response("missing_job", user_id=1)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_status_forbidden_wrong_user(self) -> None:
        job_id = create_ai_job(user_id=10, kind="test")
        resp = ai_job_status_response(job_id, user_id=99)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_status_ok(self) -> None:
        job_id = create_ai_job(user_id=7, kind="test")
        resp = ai_job_status_response(job_id, user_id=7)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["job_id"], job_id)
        self.assertEqual(resp.data["status"], "pending")
