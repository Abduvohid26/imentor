from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field


class LocationPingRequest(BaseModel):
    latitude: float
    longitude: float
    accuracy_m: float | None = None
    client_ts_ms: int | None = None
    client_kind: str = ""


class CampusBuildingIn(BaseModel):
    name: str = Field(max_length=255)
    short_code: str = ""
    latitude: float
    longitude: float
    radius_m: int = 100
    boundary: list = []
    sort_order: int = 0
    notes: str = ""
    is_active: bool = True


class CampusBuildingPatch(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    short_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    radius_m: int | None = None
    boundary: list | None = None
    sort_order: int | None = None
    notes: str | None = None
    is_active: bool | None = None


class CampusBuildingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    short_code: str
    latitude: float
    longitude: float
    radius_m: int
    boundary: list
    sort_order: int
    notes: str
    is_active: bool
    created_at: dt.datetime
    updated_at: dt.datetime


class StaffScheduleSlotIn(BaseModel):
    owner_key: str
    week_phase: str = "every"
    weekday: int
    start_time: dt.time
    end_time: dt.time
    building_id: int | None = None
    building_name: str = ""
    latitude: float | None = None
    longitude: float | None = None
    radius_m: int = 100
    title: str = ""
    is_active: bool = True


class StaffScheduleSlotPatch(BaseModel):
    owner_key: str | None = None
    week_phase: str | None = None
    weekday: int | None = None
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    building_id: int | None = None
    building_name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    radius_m: int | None = None
    title: str | None = None
    is_active: bool | None = None


class StaffScheduleSlotOut(BaseModel):
    id: int
    owner_key: str
    week_phase: str
    week_phase_label: str
    weekday: int
    start_time: dt.time
    end_time: dt.time
    building: CampusBuildingOut | None
    building_id: int | None
    building_name: str
    latitude: float
    longitude: float
    radius_m: int
    title: str
    is_active: bool
    applies_this_calendar_week: bool
    created_at: dt.datetime
    updated_at: dt.datetime


class ScheduleBulkSlotIn(BaseModel):
    weekday: int
    start_time: dt.time
    end_time: dt.time
    building_id: int | None = None
    building_name: str = ""
    latitude: float | None = None
    longitude: float | None = None
    radius_m: int = 100
    title: str = ""


class StaffScheduleBulkRequest(BaseModel):
    owner_key: str
    week_phase: str
    replace_existing: bool = True
    slots: list[ScheduleBulkSlotIn]
