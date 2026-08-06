"""O'qituvchini kafedraga bog'lash → shu kafedradagi barcha faol fanlar."""

from __future__ import annotations

import datetime as dt

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.content import AcademicDepartment, CourseSyllabus, StaffCourseSelection
from app.models.staff_location import StaffProfile


def resolve_department(
    db: Session,
    *,
    department_id: int | None = None,
    department_name: str = "",
) -> AcademicDepartment | None:
    if department_id:
        obj = db.get(AcademicDepartment, department_id)
        if obj is not None and obj.is_active:
            return obj
    name = (department_name or "").strip()
    if not name:
        return None
    return db.execute(
        select(AcademicDepartment).where(
            AcademicDepartment.is_active.is_(True),
            AcademicDepartment.name == name,
        )
    ).scalar_one_or_none()


def sync_staff_to_department_courses(
    db: Session,
    owner_key: str,
    department: AcademicDepartment | None,
) -> None:
    """Kafedra o'zgaganda: eski biriktiruvlarni tozalab, yangi kafedra fanlarini yozadi.

    variant_label="" — yo'nalish erkin (barcha variantlar).
    """
    db.execute(delete(StaffCourseSelection).where(StaffCourseSelection.owner_key == owner_key))
    if department is None:
        return

    fans = (
        db.execute(
            select(CourseSyllabus).where(
                CourseSyllabus.department_id == department.id,
                CourseSyllabus.is_active.is_(True),
            )
        )
        .scalars()
        .all()
    )
    now = dt.datetime.now(dt.timezone.utc)
    for fan in fans:
        db.add(
            StaffCourseSelection(
                owner_key=owner_key,
                syllabus_id=fan.id,
                variant_label="",
                selected_at=now,
            )
        )


def ensure_department_course_selections(db: Session, owner_key: str, department_id: int | None) -> None:
    """Yangi fanlar kafedraga qo'shilganda my/ da avtomatik ko'rinsin."""
    if not department_id:
        return
    existing = set(
        db.execute(
            select(StaffCourseSelection.syllabus_id).where(StaffCourseSelection.owner_key == owner_key)
        ).scalars().all()
    )
    fans = (
        db.execute(
            select(CourseSyllabus).where(
                CourseSyllabus.department_id == department_id,
                CourseSyllabus.is_active.is_(True),
            )
        )
        .scalars()
        .all()
    )
    now = dt.datetime.now(dt.timezone.utc)
    for fan in fans:
        if fan.id in existing:
            continue
        db.add(
            StaffCourseSelection(
                owner_key=owner_key,
                syllabus_id=fan.id,
                variant_label="",
                selected_at=now,
            )
        )
    db.flush()


def apply_staff_department(
    db: Session,
    profile: StaffProfile,
    *,
    department_id: int | None = None,
    department_name: str = "",
) -> AcademicDepartment | None:
    """Profilga kafedra FK + nom yozadi va fan biriktiruvlarini sync qiladi."""
    dept = resolve_department(db, department_id=department_id, department_name=department_name)
    profile.department_id = dept.id if dept else None
    profile.department = dept.name if dept else (department_name or "").strip()
    sync_staff_to_department_courses(db, profile.owner_key, dept)
    return dept
