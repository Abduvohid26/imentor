"""GPS ping qabul qilish va dars jadvali bo'yicha radius tekshiruvi."""

from __future__ import annotations

import datetime

from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .geo import haversine_m
from .location_policy import (
    LIVE_PING_MAX_AGE_HOURS,
    contains_in_radius,
    is_valid_coordinate,
    should_evaluate_alerts,
    should_store_ping,
)
from .models import StaffLocationAlert, StaffLocationPing, StaffProfile, StaffScheduleSlot
from .week_schedule import current_week_phase_code

# Ping shundan eski bo'lsa "joyida" deb hisoblanmaydi — dars vaqtida telefon
# GPS'ni muntazam yuborib turishi kerak (mobil klient ~20-45s da bir yuboradi).
LIVE_STATUS_PING_FRESHNESS_MIN = 20


def _slot_geofence(slot: StaffScheduleSlot) -> tuple[float, float, int, str]:
    if slot.building_id:
        b = slot.building
        return b.latitude, b.longitude, int(b.radius_m), b.name
    return slot.latitude, slot.longitude, int(slot.radius_m), slot.building_name


def _slot_contains_point(
    slot: StaffScheduleSlot,
    lat: float,
    lng: float,
    accuracy_m: float | None,
) -> bool:
    elat, elng, radius_m, _ = _slot_geofence(slot)
    return contains_in_radius(lat, lng, elat, elng, radius_m, accuracy_m)


def record_ping_and_evaluate(
    owner_key: str,
    latitude: float,
    longitude: float,
    accuracy_m: float | None,
    client_ts_ms: int | None,
) -> tuple[StaffLocationPing | None, list[StaffLocationAlert]]:
    if not is_valid_coordinate(latitude, longitude):
        raise ValueError("invalid_coordinates")

    if not should_store_ping(accuracy_m):
        return None, []

    ping = StaffLocationPing.objects.create(
        owner_key=owner_key,
        latitude=latitude,
        longitude=longitude,
        accuracy_m=accuracy_m,
        client_ts_ms=client_ts_ms,
    )

    if not should_evaluate_alerts(accuracy_m):
        return ping, []

    now_local = timezone.localtime()
    wd = now_local.weekday()
    t = now_local.time()
    phase = current_week_phase_code(now_local)
    date_key = now_local.date()
    alerts: list[StaffLocationAlert] = []

    slots = (
        StaffScheduleSlot.objects.filter(
            owner_key=owner_key,
            weekday=wd,
            is_active=True,
        )
        .filter(Q(week_phase=StaffScheduleSlot.WEEK_EVERY) | Q(week_phase=phase))
        .select_related("building")
    )

    for slot in slots:
        if not (slot.start_time <= t <= slot.end_time):
            continue
        if _slot_contains_point(slot, latitude, longitude, accuracy_m):
            continue

        elat, elng, er, bname = _slot_geofence(slot)
        dist = haversine_m(latitude, longitude, elat, elng)
        acc_note = ""
        if accuracy_m is not None and accuracy_m > 0:
            acc_note = f" GPS aniqligi ±{accuracy_m:.0f} m."

        with transaction.atomic():
            alert, created = StaffLocationAlert.objects.get_or_create(
                owner_key=owner_key,
                slot=slot,
                alert_date=date_key,
                defaults={
                    "building_name": bname,
                    "expected_lat": elat,
                    "expected_lng": elng,
                    "actual_lat": latitude,
                    "actual_lng": longitude,
                    "distance_m": round(dist, 2),
                    "radius_m": er,
                    "slot_start": slot.start_time,
                    "slot_end": slot.end_time,
                    "message": (
                        f"Dars vaqtida {bname} dan {dist:.0f} m uzoqda "
                        f"(ruxsat radiusi {er} m).{acc_note}"
                    ),
                },
            )
            if created:
                alerts.append(alert)

    return ping, alerts


def get_live_teaching_status() -> dict:
    """
    Hozirgi vaqtga to'g'ri keladigan barcha dars slotlarini topib, har biri
    uchun eng oxirgi GPS ping bino radiusida (va yetarlicha yangi)mi
    tekshiradi — "katta ekran" jonli monitoring uchun.

    Javob: {"jami": N, "joyida": N, "joyida_emas": N, "royxat": [...]}
    Har bir ro'yxat elementi: owner_key, display_name, department, building_name,
    slot_start/end, present (bool), ping_age_min (float|None).
    """
    now_local = timezone.localtime()
    wd = now_local.weekday()
    t = now_local.time()
    phase = current_week_phase_code(now_local)

    slots = list(
        StaffScheduleSlot.objects.filter(weekday=wd, is_active=True)
        .filter(Q(week_phase=StaffScheduleSlot.WEEK_EVERY) | Q(week_phase=phase))
        .select_related("building")
    )
    now_slots = [s for s in slots if s.start_time <= t <= s.end_time]

    if not now_slots:
        return {"jami": 0, "joyida": 0, "joyida_emas": 0, "royxat": []}

    owner_keys = {s.owner_key for s in now_slots}

    latest_pings: dict[str, StaffLocationPing] = {}
    since = now_local - datetime.timedelta(hours=LIVE_PING_MAX_AGE_HOURS)
    for ping in (
        StaffLocationPing.objects.filter(owner_key__in=owner_keys, recorded_at__gte=since)
        .order_by("owner_key", "-recorded_at")
        .iterator(chunk_size=500)
    ):
        if ping.owner_key not in latest_pings:
            latest_pings[ping.owner_key] = ping

    users_by_username = {
        u.username: u for u in User.objects.filter(username__in=owner_keys)
    }
    profiles_by_owner = {
        p.owner_key: p for p in StaffProfile.objects.filter(owner_key__in=owner_keys)
    }

    rows = []
    present_count = 0
    for slot in now_slots:
        ping = latest_pings.get(slot.owner_key)
        present = False
        ping_age_min: float | None = None
        if ping is not None:
            ping_age_min = round((now_local - ping.recorded_at).total_seconds() / 60, 1)
            if (
                ping_age_min <= LIVE_STATUS_PING_FRESHNESS_MIN
                and _slot_contains_point(slot, ping.latitude, ping.longitude, ping.accuracy_m)
            ):
                present = True
        if present:
            present_count += 1

        user = users_by_username.get(slot.owner_key)
        profile = profiles_by_owner.get(slot.owner_key)
        display_name = (
            f"{user.first_name} {user.last_name}".strip() if user else ""
        ) or slot.owner_key
        _, _, _, building_name = _slot_geofence(slot)

        rows.append(
            {
                "owner_key": slot.owner_key,
                "display_name": display_name,
                "department": profile.department if profile else "",
                "building_name": building_name,
                "slot_start": slot.start_time.strftime("%H:%M"),
                "slot_end": slot.end_time.strftime("%H:%M"),
                "title": slot.title or "",
                "present": present,
                "ping_age_min": ping_age_min,
            }
        )

    rows.sort(key=lambda r: (r["present"], r["display_name"]))
    return {
        "jami": len(rows),
        "joyida": present_count,
        "joyida_emas": len(rows) - present_count,
        "royxat": rows,
    }
