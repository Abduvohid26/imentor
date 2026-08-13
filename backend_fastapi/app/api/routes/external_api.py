from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_external_api_key
from app.core.db import get_db
from app.models.content import AcademicDepartment, CourseSyllabus
from app.models.prepared_content import PreparedContent
from app.services import content_catalog as cc
from app.services import external_catalog as ec
from app.services.pagination import paginate

router = APIRouter(dependencies=[Depends(require_external_api_key)])

QL_BOUNDS = {"min": cc.TEST_QUESTION_LIMIT_MIN, "max": cc.TEST_QUESTION_LIMIT_MAX}
KEYS_QL_BOUNDS = {"min": cc.CASE_QUESTION_LIMIT_MIN, "max": cc.CASE_QUESTION_LIMIT_MAX}


def _params(request: Request) -> dict:
    return dict(request.query_params)


# ---------------- tests ----------------


@router.get("/external/tests/stats/")
def external_tests_stats(db: Session = Depends(get_db)) -> dict:
    body = cc.build_catalog_stats(db, published_only=True, kind="test")
    body["question_limit_bounds"] = QL_BOUNDS
    return body


@router.get("/external/tests/")
def external_tests_list(request: Request, db: Session = Depends(get_db)) -> dict:
    params = _params(request)
    min_q, err = cc.parse_test_question_limit(params.get("min_questions"), param_name="min_questions")
    if err:
        raise HTTPException(status_code=400, detail=err)
    max_q, err = cc.parse_test_question_limit(params.get("max_questions"), param_name="max_questions")
    if err:
        raise HTTPException(status_code=400, detail=err)
    if min_q is not None and max_q is not None and min_q > max_q:
        raise HTTPException(status_code=400, detail="min_questions cannot be greater than max_questions.")

    stmt = cc.filter_catalog_stmt(
        cc.published_catalog_stmt().where(PreparedContent.kind == "test"), params
    )
    stmt = cc.filter_by_stored_question_count(stmt, min_questions=min_q, max_questions=max_q)
    items = db.execute(stmt).scalars().all()
    rows = [cc.catalog_item_summary(i, include_verification=True) for i in items]
    payload = paginate(rows, request, default_page_size=50, max_page_size=200)
    payload["question_limit_bounds"] = QL_BOUNDS
    return payload


@router.get("/external/tests/{pk}/")
def external_test_detail(pk: int, request: Request, db: Session = Depends(get_db)) -> dict:
    params = _params(request)
    raw_limit = params.get("question_limit") or params.get("question_count")
    limit, err = cc.parse_test_question_limit(raw_limit)
    if err:
        raise HTTPException(status_code=400, detail=err)
    lang, err = cc.parse_test_language(params.get("language") or params.get("lang"))
    if err:
        raise HTTPException(status_code=400, detail=err)

    item = db.execute(
        cc.published_catalog_stmt().where(PreparedContent.id == pk, PreparedContent.kind == "test")
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Not found.")

    payload_raw = item.payload if isinstance(item.payload, dict) else {}
    available_langs = cc.available_test_languages(payload_raw)
    projected, used_lang = cc.project_test_payload_language(payload_raw, lang)
    payload, available, returned = cc.slice_test_payload(projected, limit)

    data = cc.catalog_item_summary(item, include_verification=True)
    data["payload"] = payload
    data["language"] = used_lang
    data["available_languages"] = available_langs
    data["question_count_available"] = available
    data["question_count_returned"] = returned
    data["question_limit_bounds"] = QL_BOUNDS
    if limit is not None:
        data["question_limit"] = limit
    return data


@router.get("/external/questions/sample/")
def external_questions_sample(request: Request, db: Session = Depends(get_db)) -> dict:
    params = _params(request)
    subject_code = (params.get("subject_code") or "").strip()
    department_code = (params.get("department_code") or "").strip()
    if not subject_code and not department_code:
        raise HTTPException(status_code=400, detail="subject_code or department_code is required.")

    raw_count = params.get("count") or params.get("question_limit") or params.get("question_count")
    count, err = cc.parse_test_question_limit(raw_count, param_name="count")
    if err:
        raise HTTPException(status_code=400, detail=err)
    # language ixtiyoriy — berilmasa har savol languages.uz/ru/en bilan qaytadi

    stmt = cc.filter_catalog_stmt(cc.published_catalog_stmt().where(PreparedContent.kind == "test"), params)
    items = db.execute(stmt).scalars().all()
    questions, available, tests_scanned = cc.collect_unique_questions_from_tests(
        items, shuffle=True, count=count
    )

    return {
        "subject_code": subject_code,
        "department_code": department_code,
        "variant_label": (params.get("variant_label") or "").strip(),
        "topic_code": (params.get("topic_code") or "").strip().lower(),
        "syllabus_id": (params.get("syllabus_id") or "").strip(),
        "available_languages": list(cc.SUPPORTED_TEST_LANGUAGES),
        "count_requested": count,
        "count_available": available,
        "count_returned": len(questions),
        "tests_scanned": tests_scanned,
        "question_limit_bounds": QL_BOUNDS,
        "questions": questions,
    }


# ---------------- keys (case) ----------------


@router.get("/external/keys/stats/")
def external_keys_stats(db: Session = Depends(get_db)) -> dict:
    body = cc.build_catalog_stats(db, published_only=True, kind="case")
    body["question_limit_bounds"] = KEYS_QL_BOUNDS
    return body


@router.get("/external/keys/")
def external_keys_list(request: Request, db: Session = Depends(get_db)) -> dict:
    params = _params(request)
    min_q, err = cc.parse_case_question_limit(params.get("min_questions"), param_name="min_questions")
    if err:
        raise HTTPException(status_code=400, detail=err)
    max_q, err = cc.parse_case_question_limit(params.get("max_questions"), param_name="max_questions")
    if err:
        raise HTTPException(status_code=400, detail=err)
    if min_q is not None and max_q is not None and min_q > max_q:
        raise HTTPException(status_code=400, detail="min_questions cannot be greater than max_questions.")

    stmt = cc.filter_catalog_stmt(
        cc.published_catalog_stmt().where(PreparedContent.kind == "case"), params
    )
    stmt = cc.filter_by_stored_question_count(stmt, min_questions=min_q, max_questions=max_q)
    items = db.execute(stmt).scalars().all()
    rows = [cc.catalog_item_summary(i, include_verification=True) for i in items]
    payload = paginate(rows, request, default_page_size=50, max_page_size=200)
    payload["question_limit_bounds"] = KEYS_QL_BOUNDS
    return payload


@router.get("/external/keys/scenarios/")
def external_keys_scenarios(request: Request, db: Session = Depends(get_db)) -> dict:
    """Keys savollarining tekis banki — UI da to'g'ridan-to'g'ri ro'yxat qilib chiqarish uchun."""
    params = _params(request)
    raw_count = params.get("count") or params.get("question_limit") or params.get("question_count")
    count, err = cc.parse_case_question_limit(raw_count, param_name="count")
    if err:
        raise HTTPException(status_code=400, detail=err)
    shuffle = str(params.get("shuffle") or "").strip().lower() not in ("0", "false", "no")

    stmt = cc.filter_catalog_stmt(
        cc.published_catalog_stmt().where(PreparedContent.kind == "case"), params
    )
    items = db.execute(stmt).scalars().all()
    scenarios, available, cases_scanned = cc.collect_case_scenarios(items, shuffle=shuffle, count=count)

    body = paginate(scenarios, request, default_page_size=50, max_page_size=200)
    body.update(
        {
            "subject_code": (params.get("subject_code") or "").strip(),
            "department_code": (params.get("department_code") or "").strip(),
            "variant_label": (params.get("variant_label") or "").strip(),
            "topic_code": (params.get("topic_code") or "").strip().lower(),
            "syllabus_id": (params.get("syllabus_id") or "").strip(),
            "count_requested": count,
            "count_available": available,
            "count_returned": len(scenarios),
            "cases_scanned": cases_scanned,
            "question_limit_bounds": KEYS_QL_BOUNDS,
        }
    )
    return body


@router.get("/external/keys/{pk}/")
def external_key_detail(pk: int, request: Request, db: Session = Depends(get_db)) -> dict:
    params = _params(request)
    raw_limit = params.get("question_limit") or params.get("question_count")
    limit, err = cc.parse_case_question_limit(raw_limit)
    if err:
        raise HTTPException(status_code=400, detail=err)

    item = db.execute(
        cc.published_catalog_stmt().where(PreparedContent.id == pk, PreparedContent.kind == "case")
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Not found.")

    payload_raw = item.payload if isinstance(item.payload, dict) else {}
    payload, available, returned = cc.slice_case_payload(payload_raw, limit)

    data = cc.catalog_item_summary(item, include_verification=True)
    data["payload"] = payload
    data["question_count_available"] = available
    data["question_count_returned"] = returned
    data["question_limit_bounds"] = KEYS_QL_BOUNDS
    if limit is not None:
        data["question_limit"] = limit
    return data


# ---------------- catalog ----------------


@router.get("/external/catalog/stats/")
def external_catalog_stats(db: Session = Depends(get_db)) -> dict:
    body = ec.build_external_catalog_stats(db)
    body["question_limit_bounds"] = QL_BOUNDS
    return body


@router.get("/external/catalog/departments/")
def external_catalog_departments(db: Session = Depends(get_db)) -> dict:
    rows = ec.external_departments_list(db)
    return {
        "count": len(rows),
        "results": rows,
        "next_step": "GET /v1/external/catalog/departments/<department_code>/subjects/",
    }


@router.get("/external/catalog/departments/{department_code}/subjects/")
def external_catalog_department_subjects(department_code: str, db: Session = Depends(get_db)) -> dict:
    exists = db.execute(
        select(AcademicDepartment).where(
            AcademicDepartment.is_active.is_(True), AcademicDepartment.code == department_code.strip()
        )
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=404, detail="Department not found.")
    rows = ec.external_catalog_subjects_for_department(db, department_code)
    return {
        "count": len(rows),
        "results": rows,
        "department": {"code": exists.code, "name": exists.name, "sort_order": exists.sort_order},
        "next_step": "GET /v1/external/catalog/subjects/<subject_code>/",
    }


@router.get("/external/catalog/departments/{department_code}/")
def external_catalog_department_detail(department_code: str, db: Session = Depends(get_db)) -> dict:
    detail = ec.external_department_detail(db, department_code)
    if detail is None:
        raise HTTPException(status_code=404, detail="Not found.")
    return detail


@router.get("/external/catalog/subjects/")
def external_catalog_subjects(request: Request, db: Session = Depends(get_db)) -> dict:
    params = _params(request)
    stmt = ec.filter_external_subjects(ec.active_syllabus_stmt(), params)
    rows_raw = db.execute(stmt).scalars().all()
    rows = []
    for obj in rows_raw:
        summary = ec.external_catalog_subject_summary(obj)
        if summary["topics_count"] > 0:
            rows.append(summary)
    return paginate(rows, request, default_page_size=50, max_page_size=200)


@router.get("/external/catalog/subjects/{subject_code:path}/")
def external_catalog_subject_detail(subject_code: str, db: Session = Depends(get_db)) -> dict:
    code = subject_code.strip()
    obj = db.execute(select(CourseSyllabus).where(CourseSyllabus.subject_code == code)).scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail="Not found.")
    detail = ec.external_catalog_subject_detail(obj)
    if detail["topics_count"] <= 0:
        raise HTTPException(status_code=404, detail="Not found.")
    return detail
