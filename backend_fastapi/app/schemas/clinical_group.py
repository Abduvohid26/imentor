from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field


class ClinicalGroupIn(BaseModel):
    name: str = Field(max_length=255)
    code: str = ""
    address: str = ""
    phone: str = ""
    contact_person: str = ""
    subscription_plan: str = "standard"
    subscription_status: str = "active"
    subscription_until: dt.date | None = None
    notes: str = ""
    is_active: bool = True


class ClinicalGroupPatch(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    code: str | None = None
    address: str | None = None
    phone: str | None = None
    contact_person: str | None = None
    subscription_plan: str | None = None
    subscription_status: str | None = None
    subscription_until: dt.date | None = None
    notes: str | None = None
    is_active: bool | None = None


class ClinicalGroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str
    address: str
    phone: str
    contact_person: str
    subscription_plan: str
    subscription_status: str
    subscription_until: dt.date | None
    notes: str
    is_active: bool
    member_count: int = 0
    admin_count: int = 0
    created_at: dt.datetime
    updated_at: dt.datetime


class ClinicalGroupMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    clinic_id: int
    owner_key: str
    app_role: str
    is_clinic_admin: bool
    first_name: str
    last_name: str
    display_name: str = ""
    phone_display: str = ""
    faculty: str
    department: str
    direction: str
    job_title: str
    study_group: str
    participant_kind: str
    is_active: bool
    joined_at: dt.datetime
    updated_at: dt.datetime


class ClinicalGroupMemberCreateRequest(BaseModel):
    phone_digits: str
    password: str
    app_role: str = "hodim"
    first_name: str = ""
    last_name: str = ""
    faculty: str = ""
    department: str = ""
    direction: str = ""
    job_title: str = ""
    study_group: str = ""
    participant_kind: str = ""


class ClinicalGroupMemberPatchRequest(BaseModel):
    app_role: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    faculty: str | None = None
    department: str | None = None
    direction: str | None = None
    job_title: str | None = None
    study_group: str | None = None
    participant_kind: str | None = None
    is_active: bool | None = None
    password: str | None = None


class ClinicalGroupPaymentIn(BaseModel):
    amount_uzs: str
    period_label: str
    period_start: dt.date | None = None
    period_end: dt.date | None = None
    status: str = "pending"
    payment_method: str = ""
    reference: str = ""
    notes: str = ""


class ClinicalGroupPaymentPatch(BaseModel):
    amount_uzs: str | None = None
    period_label: str | None = None
    period_start: dt.date | None = None
    period_end: dt.date | None = None
    status: str | None = None
    payment_method: str | None = None
    reference: str | None = None
    notes: str | None = None


class ClinicalGroupPaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    clinic_id: int
    amount_uzs: str
    period_label: str
    period_start: dt.date | None
    period_end: dt.date | None
    status: str
    paid_at: dt.datetime | None
    payment_method: str
    reference: str
    notes: str
    created_by: str
    created_at: dt.datetime
    updated_at: dt.datetime
