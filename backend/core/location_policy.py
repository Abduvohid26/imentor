"""Joylashuv tekshiruvi qoidalari — real GPS sharoitlari uchun."""

from __future__ import annotations

from .geo import haversine_m

# Juda noaniq GPS bo‘lsa ogohlantirish yuborilmaydi (soxta «tashqarida» oldini olish).
MAX_ACCURACY_FOR_ALERT_M = 150.0

# Juda yomon o‘lchov saqlanadi, lekin jadval tekshiruvi o‘tkazilmaydi.
MAX_ACCURACY_STORE_M = 500.0

# Radiusga qo‘shiladigan GPS xatosi buferi (metr, maksimum).
ACCURACY_BUFFER_CAP_M = 35.0

# Jonli xaritada «eski» deb hisoblanadigan ping yoshi.
LIVE_PING_MAX_AGE_HOURS = 24


def is_valid_coordinate(lat: float, lng: float) -> bool:
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return False
    if abs(lat) < 1e-6 and abs(lng) < 1e-6:
        return False
    return True


def should_store_ping(accuracy_m: float | None) -> bool:
    if accuracy_m is None:
        return True
    return float(accuracy_m) <= MAX_ACCURACY_STORE_M


def should_evaluate_alerts(accuracy_m: float | None) -> bool:
    if accuracy_m is None:
        return True
    return float(accuracy_m) <= MAX_ACCURACY_FOR_ALERT_M


def effective_radius_m(radius_m: float | int, accuracy_m: float | None) -> float:
    base = float(radius_m)
    if accuracy_m is None or accuracy_m <= 0:
        return base
    buffer = min(float(accuracy_m) * 0.5, ACCURACY_BUFFER_CAP_M)
    return base + buffer


def contains_in_radius(
    lat: float,
    lng: float,
    center_lat: float,
    center_lng: float,
    radius_m: float | int,
    accuracy_m: float | None = None,
) -> bool:
    dist = haversine_m(lat, lng, center_lat, center_lng)
    return dist <= effective_radius_m(radius_m, accuracy_m)
