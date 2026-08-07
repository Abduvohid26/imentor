"""O'qituvchini kafedraga bog'lash — fan tanlash staff self-select orqali."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.content import AcademicDepartment, StaffCourseSelection
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


def clear_staff_course_selections(db: Session, owner_key: str) -> None:
    """Kafedra o'zgaganda eski fan tanlovlarini tozalaydi (qayta tanlash majburiy)."""
    db.execute(delete(StaffCourseSelection).where(StaffCourseSelection.owner_key == owner_key))


def sync_staff_to_department_courses(
    db: Session,
    owner_key: str,
    department: AcademicDepartment | None,
) -> None:
    """Kafedra o'zgaganda: eski biriktiruvlarni tozalaydi; yangi fanlar avtomatik yozilmaydi."""
    clear_staff_course_selections(db, owner_key)
    _ = department  # fanlar staff PUT /my/ orqali tanlanadi


def apply_staff_department(
    db: Session,
    profile: StaffProfile,
    *,
    department_id: int | None = None,
    department_name: str = "",
) -> AcademicDepartment | None:
    """Profilga kafedra FK + nom yozadi va eski fan tanlovlarini tozalaydi."""
    dept = resolve_department(db, department_id=department_id, department_name=department_name)
    profile.department_id = dept.id if dept else None
    profile.department = dept.name if dept else (department_name or "").strip()
    sync_staff_to_department_courses(db, profile.owner_key, dept)
    return dept
