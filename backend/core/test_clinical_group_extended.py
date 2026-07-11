"""Klinika guruhi kengaytirilgan API testlari."""

from __future__ import annotations

from django.contrib.auth.models import Group, User
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from core.models import ClinicalGroup, ClinicalGroupMember


@override_settings(SECURE_SSL_REDIRECT=False)
class ClinicalGroupExtendedApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        cache.clear()
        self.clinic = ClinicalGroup.objects.create(
            name="Test klinika",
            phone="+998901234567",
            is_active=True,
        )

    def _admin_token(self, phone: str = "998901110077") -> str:
        user, _ = User.objects.get_or_create(username=phone)
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

    def _klinika_admin_token(self, phone: str = "998901112520") -> str:
        Group.objects.get_or_create(name="klinika_admin")
        token = self._admin_token()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        assign = self.client.post(
            f"/api/v1/admin/clinical-groups/{self.clinic.id}/assign-admin/",
            {
                "phone_digits": phone,
                "password": "ClinicAdmin123",
                "first_name": "Klinika",
                "last_name": "Admin",
            },
            format="json",
        )
        self.assertIn(assign.status_code, (200, 201), assign.content)

        login = self.client.post(
            "/api/v1/auth/local-login/",
            {"phone_digits": phone, "password": "ClinicAdmin123"},
            format="json",
        )
        self.assertEqual(login.status_code, 200, login.content)
        return login.json()["access"]

    def test_admin_lists_clinic_members(self) -> None:
        ClinicalGroupMember.objects.create(
            clinic=self.clinic,
            owner_key="998901112521",
            app_role="hodim",
            first_name="Hodim",
            last_name="Test",
            is_active=True,
        )
        token = self._admin_token()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        resp = self.client.get(f"/api/v1/admin/clinical-groups/{self.clinic.id}/members/")
        self.assertEqual(resp.status_code, 200, resp.content)
        rows = resp.json().get("results", resp.json())
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["owner_key"], "998901112521")

    def test_klinika_admin_dashboard_stats(self) -> None:
        token = self._klinika_admin_token()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        resp = self.client.get("/api/v1/clinic-admin/dashboard/")
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertEqual(body["clinic"]["id"], self.clinic.id)
        self.assertIn("stats", body)
        self.assertGreaterEqual(body["stats"]["members_total"], 1)

    def test_location_ping_rejects_desktop_client_kind(self) -> None:
        Group.objects.get_or_create(name="hodim")
        reg = self.client.post(
            "/api/v1/auth/local-login/",
            {
                "phone_digits": "998901112522",
                "password": "StrongPass123",
                "role": "hodim",
                "register": True,
            },
            format="json",
        )
        self.assertEqual(reg.status_code, 200, reg.content)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {reg.json()['access']}")
        resp = self.client.post(
            "/api/v1/staff/location-ping/",
            {
                "latitude": 40.384,
                "longitude": 71.784,
                "accuracy_m": 12,
                "client_kind": "desktop",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)
