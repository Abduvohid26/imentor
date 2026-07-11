"""Fan syllabus katalogi API testlari."""

from __future__ import annotations

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from core.models import CourseSyllabus, StaffCourseSelection


TOPIC_MIYA = {"id": "L1", "title": "Miya", "type": "lecture"}
TOPIC_YURAK = {"id": "L2", "title": "Yurak", "type": "lecture"}
TOPIC_QON = {"id": "L3", "title": "Qon aylanishi", "type": "lecture"}


@override_settings(SECURE_SSL_REDIRECT=False)
class SyllabusCatalogApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        cache.clear()
        self.syllabus = CourseSyllabus.objects.create(
            subject_name="Anatomiya",
            subject_code="anatomiya",
            file_name="anatomiya.pdf",
            topics=[TOPIC_MIYA, TOPIC_YURAK],
            variants=[
                {
                    "label": "Asosiy",
                    "file_name": "anatomiya.pdf",
                    "topics": [TOPIC_MIYA, TOPIC_YURAK],
                }
            ],
            is_active=True,
        )

    def _register(self, phone: str, role: str = "hodim") -> str:
        Group.objects.get_or_create(name=role)
        resp = self.client.post(
            "/api/v1/auth/local-login/",
            {
                "phone_digits": phone,
                "password": "StrongPass123",
                "role": role,
                "register": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        return resp.json()["access"]

    def _admin_token(self, phone: str = "998901110088") -> str:
        from django.contrib.auth.models import User

        user, created = User.objects.get_or_create(username=phone)
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

    def test_admin_create_course_syllabus(self) -> None:
        token = self._admin_token()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        resp = self.client.post(
            "/api/v1/admin/course-syllabuses/",
            {
                "subject_name": "Fiziologiya",
                "topics": [TOPIC_QON],
                "variants": [
                    {
                        "label": "Asosiy",
                        "file_name": "fiz.pdf",
                        "topics": [TOPIC_QON],
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertTrue(resp.json()["subject_code"])
        self.assertEqual(CourseSyllabus.objects.filter(subject_name="Fiziologiya").count(), 1)

    def test_hodim_catalog_lists_active_syllabuses(self) -> None:
        token = self._register("998901112400")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        resp = self.client.get("/api/v1/course-syllabuses/catalog/")
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        rows = body.get("results", body) if isinstance(body, dict) else body
        codes = {row["subject_code"] for row in rows}
        self.assertIn("anatomiya", codes)

    def test_hodim_select_and_list_course(self) -> None:
        phone = "998901112401"
        token = self._register(phone)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        resp = self.client.post(
            "/api/v1/course-syllabuses/my/",
            {"syllabus_id": self.syllabus.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        list_resp = self.client.get("/api/v1/course-syllabuses/my/")
        self.assertEqual(list_resp.status_code, 200, list_resp.content)
        self.assertEqual(len(list_resp.json()), 1)
        self.assertEqual(
            StaffCourseSelection.objects.filter(owner_key=phone, syllabus=self.syllabus).count(),
            1,
        )

    def test_hodim_delete_selection(self) -> None:
        phone = "998901112402"
        token = self._register(phone)
        StaffCourseSelection.objects.create(owner_key=phone, syllabus=self.syllabus)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        resp = self.client.delete(f"/api/v1/course-syllabuses/my/{self.syllabus.id}/")
        self.assertEqual(resp.status_code, 204, resp.content)
        self.assertEqual(StaffCourseSelection.objects.filter(owner_key=phone).count(), 0)
