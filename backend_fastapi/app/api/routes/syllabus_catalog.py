from __future__ import annotations

import datetime as dt
import re

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.models.content import AcademicDepartment, CourseSyllabus, StaffCourseSelection
from app.models.user import User
from app.schemas.content import (
    AdminStaffCourseSelectionOut,
    AssignCourseSelectionRequest,
    StaffCourseSelectionOut,
)
from app.schemas.course_syllabus import CourseSyllabusFullOut, CourseSyllabusUpsertRequest
from app.services.pagination import paginate

router = APIRouter()

STAFF_ROLES = ("admin", "klinika_admin", "hodim", "startuper")


def _slugify_subject(name: str) -> str:
    s = (name or "").strip().lower()
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    s = re.sub(r"[-\s]+", "-", s).strip("-")
    return (s or "fan")[:64]


def _sync_legacy_fields(obj: CourseSyllabus) -> None:
    variants = obj.variants or []
    if variants:
        first = variants[0]
        obj.file_name = (first.get("file_name") or obj.file_name or "")[:512]
        obj.topics = first.get("topics") or []
    elif not obj.topics:
        obj.topics = []


def _full_out(obj: CourseSyllabus) -> CourseSyllabusFullOut:
    return CourseSyllabusFullOut(
        id=obj.id,
        subject_name=obj.subject_name,
        subject_code=obj.subject_code,
        department=obj.department_id,
        department_name=obj.department.name if obj.department else "",
        department_code=obj.department.code if obj.department else "",
        description=obj.description,
        instruction_language=obj.instruction_language,
        file_name=obj.file_name,
        topics=obj.topics,
        variants=obj.variants,
        sort_order=obj.sort_order,
        is_active=obj.is_active,
        created_at=obj.created_at,
        updated_at=obj.updated_at,
    )


def _selection_out(sel: StaffCourseSelection) -> StaffCourseSelectionOut:
    return StaffCourseSelectionOut(
        id=sel.id,
        syllabus=_full_out(sel.syllabus).model_dump(),
        variant_label=sel.variant_label,
        selected_at=sel.selected_at,
    )


def _admin_selection_out(sel: StaffCourseSelection, user_cache: dict[str, User | None], db: Session) -> AdminStaffCourseSelectionOut:
    if sel.owner_key not in user_cache:
        user_cache[sel.owner_key] = db.execute(
            select(User).where(User.username == sel.owner_key)
        ).scalar_one_or_none()
    user = user_cache[sel.owner_key]
    owner_name = (f"{user.first_name} {user.last_name}".strip() if user else "") or sel.owner_key
    owner_phone_display = f"+{sel.owner_key}" if len(sel.owner_key) == 12 else sel.owner_key
    return AdminStaffCourseSelectionOut(
        id=sel.id,
        owner_key=sel.owner_key,
        owner_name=owner_name,
        owner_phone_display=owner_phone_display,
        syllabus=_full_out(sel.syllabus).model_dump(),
        variant_label=sel.variant_label,
        selected_at=sel.selected_at,
    )


@router.get("/course-syllabuses/catalog/")
def syllabus_catalog(
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_roles(*STAFF_ROLES)),
) -> dict:
    rows = (
        db.execute(
            select(CourseSyllabus)
            .where(CourseSyllabus.is_active.is_(True))
            .order_by(CourseSyllabus.sort_order, CourseSyllabus.subject_name)
        )
        .scalars()
        .all()
    )
    out = []
    for obj in rows:
        topic_count = sum(len((v or {}).get("topics") or []) for v in (obj.variants or []))
        if not topic_count and obj.topics:
            topic_count = len(obj.topics)
        if topic_count > 0:
            out.append(_full_out(obj).model_dump())
    return paginate(out, request, default_page_size=200, max_page_size=1000)


@router.get("/course-syllabuses/my/", response_model=list[StaffCourseSelectionOut])
def my_course_selections(
    db: Session = Depends(get_db),
    auth=Depends(require_roles("hodim")),
) -> list[StaffCourseSelectionOut]:
    from app.models.staff_location import StaffProfile
    from app.services import staff_department as staff_dept

    profile = db.execute(
        select(StaffProfile).where(StaffProfile.owner_key == auth.user.username)
    ).scalar_one_or_none()
    if profile is not None and profile.department_id:
        staff_dept.ensure_department_course_selections(db, auth.user.username, profile.department_id)
        db.commit()

    rows = (
        db.execute(
            select(StaffCourseSelection)
            .join(CourseSyllabus)
            .where(
                StaffCourseSelection.owner_key == auth.user.username,
                CourseSyllabus.is_active.is_(True),
            )
            .order_by(StaffCourseSelection.selected_at.desc())
        )
        .scalars()
        .all()
    )
    return [_selection_out(r) for r in rows]


@router.post("/course-syllabuses/my/")
def my_course_selections_create_forbidden(auth=Depends(require_roles("hodim"))) -> None:
    raise HTTPException(
        status_code=403, detail="Fanni faqat administrator biriktiradi. Administrator bilan bog'laning."
    )


@router.delete("/course-syllabuses/my/{syllabus_id}/")
def my_course_selection_delete_forbidden(syllabus_id: int, auth=Depends(require_roles("hodim"))) -> None:
    raise HTTPException(status_code=403, detail="Fanni faqat administrator olib tashlaydi.")


@router.get("/admin/staff-course-selections/")
def admin_list_course_selections(
    request: Request,
    syllabus_id: int | None = None,
    db: Session = Depends(get_db),
    auth=Depends(require_roles("admin")),
) -> dict:
    stmt = select(StaffCourseSelection).order_by(StaffCourseSelection.selected_at.desc())
    if syllabus_id is not None:
        stmt = stmt.where(StaffCourseSelection.syllabus_id == syllabus_id)
    rows = db.execute(stmt).scalars().all()
    user_cache: dict[str, User | None] = {}
    out = [_admin_selection_out(r, user_cache, db).model_dump() for r in rows]
    return paginate(out, request, default_page_size=100, max_page_size=500)


@router.post(
    "/admin/staff-course-selections/",
    response_model=list[AdminStaffCourseSelectionOut],
    status_code=status.HTTP_201_CREATED,
)
def admin_assign_course_selection(
    payload: AssignCourseSelectionRequest,
    db: Session = Depends(get_db),
    auth=Depends(require_roles("admin")),
) -> list[AdminStaffCourseSelectionOut]:
    digits = "".join(ch for ch in payload.phone_digits if ch.isdigit())
    if len(digits) != 12 or not digits.startswith("998"):
        raise HTTPException(status_code=400, detail="phone_digits noto'g'ri format.")

    if db.execute(select(User).where(User.username == digits)).scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Bu telefon raqamli xodim topilmadi.")

    syllabus = db.get(CourseSyllabus, payload.syllabus_id)
    if syllabus is None:
        raise HTTPException(status_code=404, detail="Fan topilmadi.")

    available = [
        (v.get("label") or "").strip() for v in (syllabus.variants or []) if (v.get("label") or "").strip()
    ]
    labels = [lbl.strip() for lbl in payload.variant_labels if lbl.strip()]
    labels = list(dict.fromkeys(labels))

    if available:
        invalid = [lbl for lbl in labels if lbl not in available]
        if invalid:
            raise HTTPException(status_code=400, detail="Noto'g'ri syllabus/yo'nalish.")
        if not labels:
            raise HTTPException(status_code=400, detail="Kamida bitta syllabus (yo'nalish) tanlang.")
    else:
        labels = [""]

    results: list[StaffCourseSelection] = []
    for label in labels:
        sel = db.execute(
            select(StaffCourseSelection).where(
                StaffCourseSelection.owner_key == digits,
                StaffCourseSelection.syllabus_id == syllabus.id,
                StaffCourseSelection.variant_label == label,
            )
        ).scalar_one_or_none()
        if sel is None:
            sel = StaffCourseSelection(
                owner_key=digits,
                syllabus_id=syllabus.id,
                variant_label=label,
                selected_at=dt.datetime.now(dt.timezone.utc),
            )
            db.add(sel)
            db.flush()
        results.append(sel)

    db.commit()
    for r in results:
        db.refresh(r)
    user_cache: dict[str, User | None] = {}
    return [_admin_selection_out(r, user_cache, db) for r in results]


@router.delete("/admin/staff-course-selections/{pk}/", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def admin_delete_course_selection(
    pk: int,
    db: Session = Depends(get_db),
    auth=Depends(require_roles("admin")),
) -> None:
    obj = db.get(StaffCourseSelection, pk)
    if obj is None:
        raise HTTPException(status_code=404, detail="Topilmadi.")
    db.delete(obj)
    db.commit()


# ---------------- Admin: CourseSyllabus CRUD ----------------


@router.get("/admin/course-syllabuses/stats/")
def admin_syllabus_stats(
    db: Session = Depends(get_db),
    auth=Depends(require_roles("admin")),
) -> dict:
    by_department = db.execute(
        select(
            AcademicDepartment.id,
            AcademicDepartment.name,
            AcademicDepartment.code,
            func.count(CourseSyllabus.id).filter(CourseSyllabus.is_active.is_(True)).label("subjects_count"),
        )
        .select_from(AcademicDepartment)
        .join(CourseSyllabus, CourseSyllabus.department_id == AcademicDepartment.id, isouter=True)
        .where(AcademicDepartment.is_active.is_(True))
        .group_by(
            AcademicDepartment.id,
            AcademicDepartment.name,
            AcademicDepartment.code,
            AcademicDepartment.sort_order,
        )
        .order_by(AcademicDepartment.sort_order, AcademicDepartment.name)
    ).all()

    active_rows = db.execute(
        select(CourseSyllabus.variants, CourseSyllabus.topics).where(CourseSyllabus.is_active.is_(True))
    ).all()
    subjects_total = db.execute(select(func.count()).select_from(CourseSyllabus)).scalar_one()
    variants_count = 0
    topics_count = 0
    for variants, topics in active_rows:
        if variants:
            variants_count += len(variants)
            for variant in variants:
                topics_count += len((variant or {}).get("topics") or [])
        elif topics:
            variants_count += 1
            topics_count += len(topics)

    return {
        "departments_count": len(by_department),
        "subjects_count": len(active_rows),
        "subjects_total": subjects_total,
        "variants_count": variants_count,
        "topics_count": topics_count,
        "by_department": [
            {"id": r.id, "name": r.name, "code": r.code, "subjects_count": r.subjects_count}
            for r in by_department
        ],
    }


@router.get("/admin/course-syllabuses/")
def admin_list_syllabuses(
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_roles("admin")),
) -> dict:
    rows = db.execute(
        select(CourseSyllabus).order_by(CourseSyllabus.sort_order, CourseSyllabus.subject_name)
    ).scalars().all()
    out = [_full_out(r).model_dump() for r in rows]
    return paginate(out, request, default_page_size=200, max_page_size=1000)


@router.post(
    "/admin/course-syllabuses/",
    response_model=CourseSyllabusFullOut,
    status_code=status.HTTP_201_CREATED,
)
def admin_create_syllabus(
    payload: CourseSyllabusUpsertRequest,
    db: Session = Depends(get_db),
    auth=Depends(require_roles("admin")),
) -> CourseSyllabusFullOut:
    if not (payload.subject_name or "").strip():
        raise HTTPException(status_code=400, detail="Fan nomi kerak.")

    code = payload.subject_code.strip() or _slugify_subject(payload.subject_name)
    base_code = code
    n = 1
    while db.execute(select(CourseSyllabus).where(CourseSyllabus.subject_code == code)).scalar_one_or_none():
        code = f"{base_code}-{n}"[:64]
        n += 1

    variants = [v.model_dump() for v in payload.variants]
    file_name = payload.file_name.strip() or f"{payload.subject_name.strip()}.pdf"
    topics = payload.topics
    if variants and not payload.file_name.strip():
        file_name = variants[0]["file_name"]
    if variants and not topics:
        topics = variants[0]["topics"]

    instr_lang = payload.instruction_language.strip().lower()
    if instr_lang not in ("uz", "en", "ru"):
        instr_lang = "uz"

    now = dt.datetime.now(dt.timezone.utc)
    obj = CourseSyllabus(
        subject_name=payload.subject_name.strip(),
        subject_code=code,
        department_id=payload.department_id,
        description=payload.description.strip()[:512],
        instruction_language=instr_lang,
        file_name=file_name,
        topics=topics,
        variants=variants,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
        created_at=now,
        updated_at=now,
    )
    _sync_legacy_fields(obj)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _full_out(obj)


@router.patch("/admin/course-syllabuses/{pk}/", response_model=CourseSyllabusFullOut)
def admin_update_syllabus(
    pk: int,
    payload: CourseSyllabusUpsertRequest,
    db: Session = Depends(get_db),
    auth=Depends(require_roles("admin")),
) -> CourseSyllabusFullOut:
    obj = db.get(CourseSyllabus, pk)
    if obj is None:
        raise HTTPException(status_code=404, detail="Topilmadi.")

    data = payload.model_dump(exclude_unset=True)
    if "subject_name" in data and data["subject_name"]:
        obj.subject_name = data["subject_name"].strip()
    if "description" in data:
        obj.description = (data.get("description") or "").strip()[:512]
    if "variants" in data:
        incoming = data["variants"]
        if data.get("append_variants"):
            existing = list(obj.variants or [])
            existing_labels = {(v.get("label") or "").lower() for v in existing}
            for v in incoming:
                key = (v.get("label") or "").lower()
                if key in existing_labels:
                    existing = [x for x in existing if (x.get("label") or "").lower() != key]
                    existing_labels.discard(key)
                existing.append(v)
            obj.variants = existing
        else:
            obj.variants = incoming
        _sync_legacy_fields(obj)
    if "file_name" in data and data["file_name"]:
        obj.file_name = data["file_name"].strip()
    if "topics" in data:
        obj.topics = data["topics"]
    if "sort_order" in data:
        obj.sort_order = int(data["sort_order"])
    if "is_active" in data:
        obj.is_active = bool(data["is_active"])
    if "department_id" in data:
        obj.department_id = data["department_id"]
    if "instruction_language" in data:
        lang = (data.get("instruction_language") or "uz").strip().lower()
        if lang in ("uz", "en", "ru"):
            obj.instruction_language = lang
    if data.get("subject_code"):
        new_code = data["subject_code"].strip()[:64]
        if new_code != obj.subject_code:
            clash = db.execute(
                select(CourseSyllabus).where(CourseSyllabus.subject_code == new_code, CourseSyllabus.id != pk)
            ).scalar_one_or_none()
            if clash is None:
                obj.subject_code = new_code

    obj.updated_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
    db.refresh(obj)
    return _full_out(obj)


@router.delete("/admin/course-syllabuses/{pk}/", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def admin_delete_syllabus(
    pk: int,
    db: Session = Depends(get_db),
    auth=Depends(require_roles("admin")),
) -> None:
    from sqlalchemy import delete as sa_delete, update
    from sqlalchemy.exc import IntegrityError

    from app.models.prepared_content import PreparedContent

    obj = db.get(CourseSyllabus, pk)
    if obj is None:
        raise HTTPException(status_code=404, detail="Topilmadi.")

    # Bog'liq yozuvlarni avval tozalash (DB CASCADE/SET NULL ba'zan ishlamaydi).
    db.execute(sa_delete(StaffCourseSelection).where(StaffCourseSelection.syllabus_id == pk))
    db.execute(
        update(PreparedContent).where(PreparedContent.syllabus_id == pk).values(syllabus_id=None)
    )
    try:
        db.delete(obj)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Bu fanni o'chirib bo'lmadi — bog'liq ma'lumotlar mavjud.",
        ) from exc
