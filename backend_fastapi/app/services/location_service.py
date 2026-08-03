from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.staff_location import (
    CampusBuilding,
    StaffLocationAlert,
    StaffLocationPing,
    StaffProfile,
    StaffScheduleSlot,
)
from app.models.user import User
from app.services.geo import (
    LIVE_PING_MAX_AGE_HOURS,
    contains_in_radius,
    current_week_phase_code,
    haversine_m,
    is_valid_coordinate,
    should_evaluate_alerts,
    should_store_ping,
)

TASHKENT_TZ = ZoneInfo("Asia/Tashkent")

# Ping shundan eski bo'lsa "joyida" deb hisoblanmaydi.
LIVE_STATUS_PING_FRESHNESS_MIN = 20


def now_local() -> dt.datetime:
    return dt.datetime.now(TASHKENT_TZ)


def _slot_contains_point(slot: StaffScheduleSlot, lat: float, lng: float, accuracy_m: float | None) -> bool:
    elat, elng, radius_m, _ = slot.geofence()
    return contains_in_radius(lat, lng, elat, elng, radius_m, accuracy_m)


def record_ping_and_evaluate(
    db: Session,
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

    ping = StaffLocationPing(
        owner_key=owner_key,
        latitude=latitude,
        longitude=longitude,
        accuracy_m=accuracy_m,
        client_ts_ms=client_ts_ms,
        recorded_at=dt.datetime.now(dt.timezone.utc),
    )
    db.add(ping)
    db.flush()

    if not should_evaluate_alerts(accuracy_m):
        db.commit()
        return ping, []

    local = now_local()
    wd = local.weekday()
    t = local.time()
    phase = current_week_phase_code(local)
    date_key = local.date()
    alerts: list[StaffLocationAlert] = []

    slots = (
        db.execute(
            select(StaffScheduleSlot).where(
                StaffScheduleSlot.owner_key == owner_key,
                StaffScheduleSlot.weekday == wd,
                StaffScheduleSlot.is_active.is_(True),
                or_(StaffScheduleSlot.week_phase == "every", StaffScheduleSlot.week_phase == phase),
            )
        )
        .scalars()
        .all()
    )

    for slot in slots:
        if not (slot.start_time <= t <= slot.end_time):
            continue
        if _slot_contains_point(slot, latitude, longitude, accuracy_m):
            continue

        elat, elng, er, bname = slot.geofence()
        dist = haversine_m(latitude, longitude, elat, elng)
        acc_note = f" GPS aniqligi ±{accuracy_m:.0f} m." if accuracy_m else ""

        existing = db.execute(
            select(StaffLocationAlert).where(
                StaffLocationAlert.owner_key == owner_key,
                StaffLocationAlert.slot_id == slot.id,
                StaffLocationAlert.alert_date == date_key,
            )
        ).scalar_one_or_none()
        if existing is not None:
            continue

        alert = StaffLocationAlert(
            owner_key=owner_key,
            slot_id=slot.id,
            building_name=bname,
            expected_lat=elat,
            expected_lng=elng,
            actual_lat=latitude,
            actual_lng=longitude,
            distance_m=round(dist, 2),
            radius_m=er,
            slot_start=slot.start_time,
            slot_end=slot.end_time,
            message=(
                f"Dars vaqtida {bname} dan {dist:.0f} m uzoqda "
                f"(ruxsat radiusi {er} m).{acc_note}"
            ),
            alert_date=date_key,
            created_at=dt.datetime.now(dt.timezone.utc),
        )
        try:
            with db.begin_nested():
                db.add(alert)
                db.flush()
        except IntegrityError:
            continue
        alerts.append(alert)

    db.commit()
    return ping, alerts


def get_live_teaching_status(db: Session) -> dict:
    local = now_local()
    wd = local.weekday()
    t = local.time()
    phase = current_week_phase_code(local)

    slots = (
        db.execute(
            select(StaffScheduleSlot).where(
                StaffScheduleSlot.weekday == wd,
                StaffScheduleSlot.is_active.is_(True),
                or_(StaffScheduleSlot.week_phase == "every", StaffScheduleSlot.week_phase == phase),
            )
        )
        .scalars()
        .all()
    )
    now_slots = [s for s in slots if s.start_time <= t <= s.end_time]

    if not now_slots:
        return {"jami": 0, "joyida": 0, "joyida_emas": 0, "royxat": []}

    owner_keys = {s.owner_key for s in now_slots}

    since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=LIVE_PING_MAX_AGE_HOURS)
    pings = (
        db.execute(
            select(StaffLocationPing)
            .where(StaffLocationPing.owner_key.in_(owner_keys), StaffLocationPing.recorded_at >= since)
            .order_by(StaffLocationPing.owner_key, StaffLocationPing.recorded_at.desc())
        )
        .scalars()
        .all()
    )
    latest_pings: dict[str, StaffLocationPing] = {}
    for ping in pings:
        if ping.owner_key not in latest_pings:
            latest_pings[ping.owner_key] = ping

    users_by_username = {
        u.username: u
        for u in db.execute(select(User).where(User.username.in_(owner_keys))).scalars().all()
    }
    profiles_by_owner = {
        p.owner_key: p
        for p in db.execute(
            select(StaffProfile).where(StaffProfile.owner_key.in_(owner_keys))
        )
        .scalars()
        .all()
    }

    rows = []
    present_count = 0
    now_utc = dt.datetime.now(dt.timezone.utc)
    for slot in now_slots:
        ping = latest_pings.get(slot.owner_key)
        present = False
        ping_age_min: float | None = None
        if ping is not None:
            ping_age_min = round((now_utc - ping.recorded_at).total_seconds() / 60, 1)
            if ping_age_min <= LIVE_STATUS_PING_FRESHNESS_MIN and _slot_contains_point(
                slot, ping.latitude, ping.longitude, ping.accuracy_m
            ):
                present = True
        if present:
            present_count += 1

        user = users_by_username.get(slot.owner_key)
        profile = profiles_by_owner.get(slot.owner_key)
        display_name = (f"{user.first_name} {user.last_name}".strip() if user else "") or slot.owner_key
        _, _, _, building_name = slot.geofence()

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
