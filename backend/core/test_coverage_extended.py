"""Qo'shimcha API qamrovi — startup, handout, presentation, device pair, public catalog."""

from __future__ import annotations

from datetime import timedelta
from io import BytesIO

from django.contrib.auth.models import Group, User
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import DevicePairingSession, PreparedContent, StartupProjectApplication

MINIMAL_PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f"
    b"\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)


class ApiTestMixin:
    client: APIClient

    def _register(
        self,
        phone: str,
        password: str = "StrongPass123",
        role: str = "hodim",
        **extra,
    ) -> dict:
        Group.objects.get_or_create(name=role)
        resp = self.client.post(
            "/api/v1/auth/local-login/",
            {
                "phone_digits": phone,
                "password": password,
                "role": role,
                "register": True,
                **extra,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        return resp.json()

    def _admin_token(self, phone: str = "998901110099") -> str:
        user, created = User.objects.get_or_create(username=phone, defaults={"first_name": "A", "last_name": "D"})
        if created or not user.has_usable_password():
            user.set_password("AdminPass123")
            user.save(update_fields=["password"])
        group, _ = Group.objects.get_or_create(name="admin")
        user.groups.add(group)
        resp = self.client.post(
            "/api/v1/auth/local-login/",
            {"phone_digits": phone, "password": "AdminPass123"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        return resp.json()["access"]


class DevicePairingApiTests(ApiTestMixin, TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        cache.clear()

    def test_device_pair_confirm_issues_tokens(self) -> None:
        create = self.client.post("/api/v1/device-pair/create/", {}, format="json")
        self.assertEqual(create.status_code, 201)
        token = create.json()["pairing_token"]
        secret = create.json()["desktop_secret"]

        access = self._register("998901114001", role="hodim")["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        confirm = self.client.post(
            "/api/v1/device-pair/confirm/",
            {
                "pairing_token": token,
                "profile": {"displayName": "Mobil Hodim", "firstName": "Mobil", "lastName": "Hodim"},
            },
            format="json",
        )
        self.assertEqual(confirm.status_code, 200, confirm.content)

        self.client.credentials()
        status_resp = self.client.get(
            f"/api/v1/device-pair/status/{token}/",
            HTTP_X_DESKTOP_SECRET=secret,
        )
        self.assertEqual(status_resp.status_code, 200)
        body = status_resp.json()
        self.assertEqual(body["status"], "confirmed")
        self.assertTrue(body.get("access"))
        self.assertEqual(body.get("role"), "hodim")
        profile = body.get("profile") or {}
        self.assertNotIn("password", profile)

    def test_device_pair_confirm_rejects_startuper(self) -> None:
        create = self.client.post("/api/v1/device-pair/create/", {}, format="json")
        token = create.json()["pairing_token"]
        access = self._register("998901114002", role="startuper")["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        confirm = self.client.post(
            "/api/v1/device-pair/confirm/",
            {"pairing_token": token, "profile": {}},
            format="json",
        )
        self.assertEqual(confirm.status_code, 403)


class StartupApplicationApiTests(ApiTestMixin, TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def test_create_submit_and_admin_inbox(self) -> None:
        access = self._register("998901114010", role="startuper")["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        create = self.client.post(
            "/api/v1/startup-applications/",
            {"title": "Demo loyiha", "summary": "Qisqa", "description": "To'liq"},
            format="json",
        )
        self.assertEqual(create.status_code, 201, create.content)
        app_id = create.json()["id"]
        self.assertEqual(create.json()["status"], "draft")

        submit = self.client.post(f"/api/v1/startup-applications/{app_id}/submit/", {}, format="json")
        self.assertEqual(submit.status_code, 200)
        self.assertEqual(submit.json()["status"], "submitted")

        repeat = self.client.post(f"/api/v1/startup-applications/{app_id}/submit/", {}, format="json")
        self.assertEqual(repeat.status_code, 400)

        admin = self._admin_token()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {admin}")
        inbox = self.client.get("/api/v1/startup-applications/admin/inbox/")
        self.assertEqual(inbox.status_code, 200)
        results = inbox.json().get("results", inbox.json())
        self.assertTrue(any(r["id"] == app_id for r in results))

    def test_cannot_delete_submitted_application(self) -> None:
        access = self._register("998901114011", role="startuper")["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        create = self.client.post(
            "/api/v1/startup-applications/",
            {"title": "Yuboriladi", "summary": "s"},
            format="json",
        )
        app_id = create.json()["id"]
        self.client.post(f"/api/v1/startup-applications/{app_id}/submit/", {}, format="json")
        delete = self.client.delete(f"/api/v1/startup-applications/{app_id}/")
        self.assertEqual(delete.status_code, 400)

    def test_startup_applications_pagination(self) -> None:
        access = self._register("998901114012", role="startuper")["access"]
        for i in range(3):
            StartupProjectApplication.objects.create(
                owner_key="998901114012",
                title=f"Loyiha {i}",
                summary="s",
            )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        page = self.client.get("/api/v1/startup-applications/?page=1&page_size=2")
        self.assertEqual(page.status_code, 200)
        body = page.json()
        self.assertEqual(body["count"], 3)
        self.assertEqual(len(body["results"]), 2)


class PublicContentCatalogApiTests(ApiTestMixin, TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def _old_case(self, topic: str) -> PreparedContent:
        obj = PreparedContent.objects.create(
            owner_key="998901114020",
            kind=PreparedContent.KIND_CASE,
            topic=topic,
            topic_norm=topic.lower(),
            author_display_name="Muallif",
            subject_name="Anatomiya",
            subject_code="ANAT",
            payload={"topic": topic, "questions": [{"scenario": "s", "answer": "a"}]},
        )
        PreparedContent.objects.filter(pk=obj.pk).update(
            created_at=timezone.now() - timedelta(hours=2)
        )
        return obj

    def test_public_list_and_detail(self) -> None:
        item = self._old_case("Ochiq keys")
        listing = self.client.get("/api/v1/public/content-catalog/")
        self.assertEqual(listing.status_code, 200)
        results = listing.json().get("results", [])
        self.assertTrue(any(r["id"] == item.id for r in results))
        self.assertIn("verification_code", results[0])

        detail = self.client.get(f"/api/v1/public/content-catalog/{item.id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertTrue(detail.json().get("view_only"))
        self.assertIn("payload", detail.json())

    def test_public_hides_recent_items(self) -> None:
        PreparedContent.objects.create(
            owner_key="998901114021",
            kind=PreparedContent.KIND_TEST,
            topic="Yangi test",
            topic_norm="yangi test",
            payload={"questions": []},
        )
        listing = self.client.get("/api/v1/public/content-catalog/")
        topics = [r["topic"] for r in listing.json().get("results", [])]
        self.assertNotIn("Yangi test", topics)


class HandoutApiTests(ApiTestMixin, TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def test_upload_list_download_delete_handout(self) -> None:
        access = self._register("998901114030")["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        pdf = SimpleUploadedFile("handout.pdf", MINIMAL_PDF, content_type="application/pdf")
        upload = self.client.post(
            "/api/v1/handouts/",
            {"topic": "Bronxial astma", "topic_norm": "bronxial astma", "file": pdf},
            format="multipart",
        )
        self.assertEqual(upload.status_code, 201, upload.content)
        handout_id = upload.json()["id"]

        listing = self.client.get("/api/v1/handouts/?topic_norm=bronxial%20astma")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.json()), 1)

        file_resp = self.client.get(f"/api/v1/handouts/{handout_id}/file/")
        self.assertEqual(file_resp.status_code, 200)

        delete = self.client.delete(f"/api/v1/handouts/{handout_id}/")
        self.assertEqual(delete.status_code, 204)

    def test_handout_rejects_invalid_extension(self) -> None:
        access = self._register("998901114031")["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        bad = SimpleUploadedFile("evil.exe", b"MZ", content_type="application/octet-stream")
        resp = self.client.post(
            "/api/v1/handouts/",
            {"topic": "Test", "topic_norm": "test", "file": bad},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)


class PresentationApiTests(ApiTestMixin, TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def test_upload_list_and_delete_presentation(self) -> None:
        access = self._register("998901114040")["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        pdf = SimpleUploadedFile("slides.pdf", MINIMAL_PDF, content_type="application/pdf")
        upload = self.client.post(
            "/api/v1/presentations/",
            {"topic": "Yurak yetishmovchiligi", "topic_norm": "yurak yetishmovchiligi", "file": pdf},
            format="multipart",
        )
        self.assertEqual(upload.status_code, 201, upload.content)
        pres_id = upload.json()["id"]

        listing = self.client.get("/api/v1/presentations/?topic_norm=yurak%20yetishmovchiligi")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.json()), 1)

        file_resp = self.client.get(f"/api/v1/presentations/{pres_id}/file/")
        self.assertEqual(file_resp.status_code, 200)

        delete = self.client.delete(f"/api/v1/presentations/{pres_id}/")
        self.assertEqual(delete.status_code, 204)

    def test_presentation_requires_topic_norm(self) -> None:
        access = self._register("998901114041")["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        resp = self.client.get("/api/v1/presentations/")
        self.assertEqual(resp.status_code, 400)


class LiveTestSecurityApiTests(ApiTestMixin, TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def test_public_live_test_hides_answer_key(self) -> None:
        access = self._register("998901114050")["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        q = {
            "question": "Savol?",
            "options": ["A", "B", "C"],
            "correctOptionIndex": 1,
            "explanation": "secret",
        }
        up = self.client.post(
            "/api/v1/live-tests/",
            {"session_key": "lts_security_1", "topic": "Mavzu", "questions": [q]},
            format="json",
        )
        self.assertEqual(up.status_code, 200)

        self.client.credentials()
        pub = self.client.get("/api/v1/live-tests/lts_security_1/")
        self.assertEqual(pub.status_code, 200)
        pub_q = pub.json()["questions"][0]
        self.assertEqual(pub_q["question"], "Savol?")
        self.assertNotIn("correctOptionIndex", pub_q)
        self.assertNotIn("explanation", pub_q)
