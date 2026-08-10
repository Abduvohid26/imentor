"""Tashqi hamkorlar uchun syllabus katalogi (kafedra -> fan -> yo'nalish -> mavzu)."""

from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.content import AcademicDepartment, CourseSyllabus


def _topic_rows(topics: list) -> list[dict]:
    rows = []
    for topic in topics or []:
        if not isinstance(topic, dict):
            continue
        topic_id = (topic.get("id") or topic.get("code") or "").strip()
        title = (topic.get("title") or topic.get("name") or topic_id).strip()
        if not topic_id and not title:
            continue
        rows.append({"id": topic_id, "title": title})
    return rows


def _variants_for(obj: CourseSyllabus) -> list[dict]:
    raw = obj.variants or []
    if raw:
        return [
            {
                "label": (v.get("label") or "Asosiy").strip(),
                "file_name": (v.get("file_name") or "").strip(),
                "topics": _topic_rows(v.get("topics") or []),
            }
            for v in raw
            if isinstance(v, dict)
        ]
    if obj.topics:
        return [{"label": "Asosiy", "file_name": (obj.file_name or "").strip(), "topics": _topic_rows(obj.topics)}]
    return []


def external_catalog_subject_summary(obj: CourseSyllabus) -> dict:
    variants = _variants_for(obj)
    topics_count = sum(len(v["topics"]) for v in variants)
    return {
        "id": obj.id,
        "subject_code": obj.subject_code,
        "subject_name": obj.subject_name,
        "department_code": obj.department.code if obj.department_id else "",
        "department_name": obj.department.name if obj.department_id else "",
        "instruction_language": obj.instruction_language or "uz",
        "variants_count": len(variants),
        "topics_count": topics_count,
        "variant_labels": [v["label"] for v in variants],
    }


def external_catalog_subject_detail(obj: CourseSyllabus) -> dict:
    summary = external_catalog_subject_summary(obj)
    summary["variants"] = _variants_for(obj)
    return summary


def active_syllabus_stmt():
    return (
        select(CourseSyllabus)
        .where(CourseSyllabus.is_active.is_(True))
        .order_by(CourseSyllabus.sort_order, CourseSyllabus.subject_name)
    )


def filter_external_subjects(stmt, params: dict):
    department_code = (params.get("department_code") or "").strip()
    if department_code:
        stmt = stmt.where(CourseSyllabus.department.has(AcademicDepartment.code == department_code))
    q = (params.get("q") or "").strip()
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(CourseSyllabus.subject_name.ilike(like), CourseSyllabus.subject_code.ilike(like)))
    return stmt


def published_test_counts_by_department(db: Session) -> dict[str, int]:
    """Kafedra kodi → e'lon qilingan testlar soni.

    Test kafedraga uch xil bog'lanishi mumkin, uchalasi ham hisobga olinadi:
    syllabus orqali; `subject_code` to'g'ridan-to'g'ri kafedra kodi bo'lganda
    (eski yozuvlar); yoki `kafedra__fan` ko'rinishidagi kod orqali.
    """
    from app.models.prepared_content import PreparedContent
    from app.services import content_catalog as cc

    dept_codes = {
        code
        for (code,) in db.execute(
            select(AcademicDepartment.code).where(AcademicDepartment.is_active.is_(True))
        ).all()
        if code
    }
    counts: dict[str, int] = {}
    items = (
        db.execute(cc.published_catalog_stmt().where(PreparedContent.kind == "test")).scalars().all()
    )
    for item in items:
        code = ""
        syllabus = item.syllabus
        if syllabus is not None and syllabus.department is not None:
            code = (syllabus.department.code or "").strip()
        if not code:
            candidates = [(item.subject_code or "").strip()]
            if syllabus is not None:
                candidates.append((syllabus.subject_code or "").strip())
            for raw in candidates:
                if not raw:
                    continue
                if raw in dept_codes:
                    code = raw
                    break
                prefix = raw.split("__", 1)[0].strip() if "__" in raw else ""
                if prefix and prefix in dept_codes:
                    code = prefix
                    break
        if not code:
            continue
        counts[code] = counts.get(code, 0) + 1
    return counts


def external_departments_list(db: Session) -> list[dict]:
    """Kafedralar ro'yxati.

    `subjects_count` — aynan shu kafedra ochilganda QAYTADIGAN fanlar soni
    (mavzusi bor sillabuslar). Ilgari bu yerda barcha aktiv sillabuslar
    sanalardi, `.../subjects/` esa mavzusizlarini tashlab yuborardi — natijada
    "3 fan" deb ko'rsatilgan kafedra ochilganda bo'sh chiqishi mumkin edi.

    `tests_count` — shu kafedrada e'lon qilingan testlar soni. Hamkor UI
    kafedrani tanlashdan oldin unda umuman test bor-yo'qligini bilishi uchun.
    """
    departments = (
        db.execute(
            select(AcademicDepartment)
            .where(AcademicDepartment.is_active.is_(True))
            .order_by(AcademicDepartment.sort_order, AcademicDepartment.name)
        )
        .scalars()
        .all()
    )
    subjects_with_topics: dict[int, int] = {}
    for obj in db.execute(active_syllabus_stmt()).scalars().all():
        if obj.department_id is None:
            continue
        if external_catalog_subject_summary(obj)["topics_count"] > 0:
            subjects_with_topics[obj.department_id] = subjects_with_topics.get(obj.department_id, 0) + 1

    tests_by_dept = published_test_counts_by_department(db)
    return [
        {
            "code": d.code,
            "name": d.name,
            "sort_order": d.sort_order,
            "subjects_count": subjects_with_topics.get(d.id, 0),
            "tests_count": tests_by_dept.get(d.code, 0),
        }
        for d in departments
    ]


def external_catalog_subjects_for_department(db: Session, department_code: str) -> list[dict]:
    code = (department_code or "").strip()
    stmt = active_syllabus_stmt().where(CourseSyllabus.department.has(AcademicDepartment.code == code))
    rows = db.execute(stmt).scalars().all()
    out = []
    for obj in rows:
        summary = external_catalog_subject_summary(obj)
        if summary["topics_count"] > 0:
            out.append(summary)
    return out


def external_department_detail(db: Session, department_code: str) -> dict | None:
    code = (department_code or "").strip()
    dept = db.execute(
        select(AcademicDepartment).where(AcademicDepartment.is_active.is_(True), AcademicDepartment.code == code)
    ).scalar_one_or_none()
    if dept is None:
        return None
    stmt = active_syllabus_stmt().where(CourseSyllabus.department.has(AcademicDepartment.code == code))
    rows = db.execute(stmt).scalars().all()
    subjects = []
    for obj in rows:
        detail = external_catalog_subject_detail(obj)
        if detail["topics_count"] > 0:
            subjects.append(detail)
    return {
        "code": dept.code,
        "name": dept.name,
        "sort_order": dept.sort_order,
        "subjects_count": len(subjects),
        "subjects": subjects,
    }


def build_syllabus_catalog_stats(db: Session) -> dict:
    by_department = db.execute(
        select(
            AcademicDepartment.name,
            AcademicDepartment.code,
            func.count(CourseSyllabus.id).filter(CourseSyllabus.is_active.is_(True)).label("subjects_count"),
        )
        .select_from(AcademicDepartment)
        .join(CourseSyllabus, CourseSyllabus.department_id == AcademicDepartment.id, isouter=True)
        .where(AcademicDepartment.is_active.is_(True))
        .group_by(AcademicDepartment.name, AcademicDepartment.code, AcademicDepartment.sort_order)
        .order_by(AcademicDepartment.sort_order, AcademicDepartment.name)
    ).all()

    active_rows = db.execute(select(CourseSyllabus.variants, CourseSyllabus.topics).where(CourseSyllabus.is_active.is_(True))).all()
    subjects_count = len(active_rows)
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
        "subjects_count": subjects_count,
        "subjects_total": subjects_total,
        "variants_count": variants_count,
        "topics_count": topics_count,
        "by_department": [
            {"name": r.name, "code": r.code, "subjects_count": r.subjects_count} for r in by_department
        ],
    }


def build_external_catalog_stats(db: Session) -> dict:
    base = build_syllabus_catalog_stats(db)
    rows = db.execute(active_syllabus_stmt()).scalars().all()
    by_subject = []
    for obj in rows:
        summary = external_catalog_subject_summary(obj)
        if summary["topics_count"] > 0:
            by_subject.append(summary)
    by_subject.sort(key=lambda r: (r["department_name"] or "zzz", r["subject_name"] or r["subject_code"]))
    return {
        "departments_count": base["departments_count"],
        "subjects_count": base["subjects_count"],
        "variants_count": base["variants_count"],
        "topics_count": base["topics_count"],
        "by_department": base["by_department"],
        "by_subject": by_subject,
    }
