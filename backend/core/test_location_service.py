"""location_service integratsiya testlari."""

from __future__ import annotations

from datetime import time

from django.test import TestCase
from django.utils import timezone

from core.location_service import record_ping_and_evaluate
from core.models import CampusBuilding, StaffLocationAlert, StaffLocationPing, StaffScheduleSlot


class LocationServiceTests(TestCase):
    def setUp(self) -> None:
        self.owner = "998901112500"
        self.building = CampusBuilding.objects.create(
            name="Anatomiya korpusi",
            short_code="AK1",
            latitude=40.384,
            longitude=71.784,
            radius_m=80,
            is_active=True,
        )
        now = timezone.localtime()
        self.slot = StaffScheduleSlot.objects.create(
            owner_key=self.owner,
            week_phase=StaffScheduleSlot.WEEK_EVERY,
            weekday=now.weekday(),
            start_time=time(0, 0),
            end_time=time(23, 59, 59),
            building=self.building,
            building_name=self.building.name,
            latitude=self.building.latitude,
            longitude=self.building.longitude,
            radius_m=self.building.radius_m,
            is_active=True,
        )

    def test_skips_ping_when_accuracy_too_poor(self) -> None:
        ping, alerts = record_ping_and_evaluate(
            self.owner,
            latitude=40.3841,
            longitude=71.7841,
            accuracy_m=600,
            client_ts_ms=None,
        )
        self.assertIsNone(ping)
        self.assertEqual(alerts, [])
        self.assertEqual(StaffLocationPing.objects.count(), 0)

    def test_inside_radius_creates_ping_without_alert(self) -> None:
        ping, alerts = record_ping_and_evaluate(
            self.owner,
            latitude=40.38405,
            longitude=71.78405,
            accuracy_m=12,
            client_ts_ms=None,
        )
        self.assertIsNotNone(ping)
        self.assertEqual(alerts, [])
        self.assertEqual(StaffLocationAlert.objects.count(), 0)

    def test_outside_radius_creates_alert_once_per_day(self) -> None:
        ping, alerts = record_ping_and_evaluate(
            self.owner,
            latitude=40.39,
            longitude=71.79,
            accuracy_m=15,
            client_ts_ms=None,
        )
        self.assertIsNotNone(ping)
        self.assertEqual(len(alerts), 1)
        self.assertEqual(StaffLocationAlert.objects.count(), 1)

        _ping2, alerts2 = record_ping_and_evaluate(
            self.owner,
            latitude=40.391,
            longitude=71.791,
            accuracy_m=15,
            client_ts_ms=None,
        )
        self.assertEqual(alerts2, [])
        self.assertEqual(StaffLocationAlert.objects.count(), 1)

    def test_invalid_coordinates_raise(self) -> None:
        with self.assertRaises(ValueError):
            record_ping_and_evaluate(self.owner, 0.0, 0.0, 10, None)
