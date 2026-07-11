"""GPS ping qabul qilish va dars jadvali bo'yicha radius tekshiruvi."""

from __future__ import annotations

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .geo import haversine_m
from .location_policy import (
    contains_in_radius,
    is_valid_coordinate,
    should_evaluate_alerts,
    should_store_ping,
)
from .models import StaffLocationAlert, StaffLocationPing, StaffScheduleSlot
from .week_schedule import current_week_phase_code


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
