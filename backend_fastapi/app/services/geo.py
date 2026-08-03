from __future__ import annotations

import math


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1 - a)))
    return r * c


MAX_ACCURACY_FOR_ALERT_M = 150.0
MAX_ACCURACY_STORE_M = 500.0
ACCURACY_BUFFER_CAP_M = 35.0
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


def current_week_phase_code(now_local) -> str:
    wn = now_local.isocalendar().week
    return "upper" if (wn % 2 == 1) else "lower"


def week_phase_label_uz(code: str) -> str:
    """Django `week_schedule.py`dagi qisqa yorliq (ScheduleWeekInfoView'da)."""
    if code == "every":
        return "Har hafta"
    if code == "upper":
        return "Yuqori hafta"
    if code == "lower":
        return "Pastki hafta"
    return code


def week_phase_choice_label_uz(code: str) -> str:
    """Django `StaffScheduleSlot.WEEK_PHASE_CHOICES`dagi to'liq yorliq
    (StaffScheduleSlotSerializer.get_week_phase_label'da ishlatiladi)."""
    if code == "every":
        return "Har hafta"
    if code == "upper":
        return "Yuqori hafta (ISO toq)"
    if code == "lower":
        return "Pastki hafta (ISO juft)"
    return code


def iso_week_number(local_dt) -> int:
    return local_dt.isocalendar().week
