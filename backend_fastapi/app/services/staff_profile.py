from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.staff_location import StaffProfile
from app.services import file_storage as storage


def get_profile(db: Session, owner_key: str) -> StaffProfile | None:
    return db.execute(select(StaffProfile).where(StaffProfile.owner_key == owner_key)).scalar_one_or_none()


def staff_photo_url_for_user(owner_key: str, db: Session) -> str:
    profile = get_profile(db, owner_key)
    if not profile or not profile.photo:
        return ""
    version = int(profile.updated_at.timestamp()) if profile.updated_at else 0
    sep = "&" if "?" in profile.photo else "?"
    return f"/media/{profile.photo}{sep}v={version}"


def delete_staff_profile_for_owner(db: Session, owner_key: str) -> None:
    profile = get_profile(db, owner_key)
    if profile is None:
        return
    if profile.photo:
        storage.delete_file(profile.photo)
    db.delete(profile)
