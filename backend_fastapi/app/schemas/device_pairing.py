from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


class DevicePairCreateOut(BaseModel):
    pairing_token: str
    desktop_secret: str
    expires_at: dt.datetime
    qr_payload: str


class DevicePairConfirmRequest(BaseModel):
    pairing_token: str
    profile: dict = {}


class DevicePairStatusOut(BaseModel):
    status: str
    expires_at: dt.datetime | None = None
    access: str = ""
    refresh: str = ""
    role: str = ""
    username: str = ""
    profile: dict = {}
