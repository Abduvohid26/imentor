"""location_policy unit testlari."""

from __future__ import annotations

from django.test import SimpleTestCase

from core.location_policy import (
    MAX_ACCURACY_FOR_ALERT_M,
    MAX_ACCURACY_STORE_M,
    contains_in_radius,
    effective_radius_m,
    is_valid_coordinate,
    should_evaluate_alerts,
    should_store_ping,
)


class LocationPolicyTests(SimpleTestCase):
    def test_is_valid_coordinate_rejects_null_island(self) -> None:
        self.assertFalse(is_valid_coordinate(0.0, 0.0))

    def test_is_valid_coordinate_accepts_fergana_area(self) -> None:
        self.assertTrue(is_valid_coordinate(40.384, 71.784))

    def test_should_store_ping_respects_max_accuracy(self) -> None:
        self.assertTrue(should_store_ping(None))
        self.assertTrue(should_store_ping(MAX_ACCURACY_STORE_M))
        self.assertFalse(should_store_ping(MAX_ACCURACY_STORE_M + 1))

    def test_should_evaluate_alerts_respects_max_accuracy(self) -> None:
        self.assertTrue(should_evaluate_alerts(10))
        self.assertTrue(should_evaluate_alerts(MAX_ACCURACY_FOR_ALERT_M))
        self.assertFalse(should_evaluate_alerts(MAX_ACCURACY_FOR_ALERT_M + 1))

    def test_effective_radius_adds_accuracy_buffer(self) -> None:
        self.assertEqual(effective_radius_m(100, None), 100.0)
        self.assertEqual(effective_radius_m(100, 20), 110.0)

    def test_contains_in_radius_uses_buffered_distance(self) -> None:
        center_lat, center_lng = 40.384, 71.784
        near_lat, near_lng = 40.3841, 71.7841
        self.assertTrue(contains_in_radius(near_lat, near_lng, center_lat, center_lng, 50, 10))
        far_lat, far_lng = 40.5, 72.0
        self.assertFalse(contains_in_radius(far_lat, far_lng, center_lat, center_lng, 50, 10))
