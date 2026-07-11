"""clinical_group_service unit testlari."""

from __future__ import annotations

from django.contrib.auth.models import Group, User
from django.test import TestCase

from core.clinical_group_service import (
    can_provision_role,
    clinic_auth_payload,
    clinic_for_klinika_admin,
    deactivate_clinic_member,
    member_belongs_to_clinic,
    upsert_clinic_member,
)
from core.models import ClinicalGroup, ClinicalGroupMember


class ClinicalGroupServiceTests(TestCase):
    def setUp(self) -> None:
        self.clinic = ClinicalGroup.objects.create(
            name="Shifo klinikasi",
            phone="+998901112233",
            is_active=True,
        )

    def test_can_provision_role_matrix(self) -> None:
        self.assertTrue(can_provision_role("admin", "hodim"))
        self.assertTrue(can_provision_role("admin", "klinika_admin"))
        self.assertFalse(can_provision_role("klinika_admin", "admin"))
        self.assertTrue(can_provision_role("klinika_admin", "hodim"))
        self.assertFalse(can_provision_role("hodim", "startuper"))

    def test_upsert_and_deactivate_member(self) -> None:
        member = upsert_clinic_member(
            self.clinic,
            "998901112510",
            app_role="hodim",
            first_name="Ali",
            last_name="Valiyev",
        )
        self.assertEqual(member.app_role, "hodim")
        self.assertTrue(member_belongs_to_clinic("998901112510", self.clinic))

        self.assertTrue(deactivate_clinic_member(self.clinic, "998901112510"))
        self.assertFalse(member_belongs_to_clinic("998901112510", self.clinic))

    def test_clinic_auth_payload_for_klinika_admin(self) -> None:
        phone = "998901112511"
        Group.objects.get_or_create(name="klinika_admin")
        user = User.objects.create_user(username=phone, password="x")
        user.groups.add(Group.objects.get(name="klinika_admin"))
        upsert_clinic_member(
            self.clinic,
            phone,
            app_role="klinika_admin",
            is_clinic_admin=True,
        )

        payload = clinic_auth_payload(user)
        self.assertEqual(payload["clinic_id"], self.clinic.id)
        self.assertEqual(payload["clinic_name"], self.clinic.name)
        self.assertEqual(clinic_for_klinika_admin(user), self.clinic)

    def test_clinic_auth_payload_empty_without_membership(self) -> None:
        user = User.objects.create_user(username="998901112512", password="x")
        payload = clinic_auth_payload(user)
        self.assertIsNone(payload["clinic_id"])
        self.assertEqual(payload["clinic_name"], "")
