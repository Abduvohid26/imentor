"""Keys va testlar umumiy bazasi — yaratilishi bilan e'lon qilinadi."""

from __future__ import annotations

import hashlib
import hmac
import re
from datetime import timedelta, timezone as dt_timezone
from datetime import datetime as dt_datetime

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.content import AcademicDepartment, CourseSyllabus
from app.models.prepared_content import CATALOG_KINDS, KIND_CASE, PreparedContent

PUBLISH_DELAY = timedelta(0)
_TOPIC_NORM_RE = re.compile(r"^(\d+)::([^:]+)::(.+)$")
TEST_QUESTION_LIMIT_MIN = 10
TEST_QUESTION_LIMIT_MAX = 30


def parse_test_question_limit(value: str | None, *, param_name: str = "question_limit") -> tuple[int | None, str | None]:
    if value is None or not str(value).strip():
        return None, None
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        return None, (
            f"{param_name} must be an integer between {TEST_QUESTION_LIMIT_MIN} and {TEST_QUESTION_LIMIT_MAX}."
        )
    if parsed < TEST_QUESTION_LIMIT_MIN or parsed > TEST_QUESTION_LIMIT_MAX:
        return None, (
            f"{param_name} must be between {TEST_QUESTION_LIMIT_MIN} and {TEST_QUESTION_LIMIT_MAX}."
        )
    return parsed, None


def slice_test_payload(payload: dict | None, limit: int | None) -> tuple[dict, int, int]:
    base = dict(payload) if isinstance(payload, dict) else {}
    questions = base.get("questions")
    if not isinstance(questions, list):
        base["questions"] = []
        return base, 0, 0
    available = len(questions)
    if limit is None:
        return base, available, available
    taken = questions[:limit]
    base["questions"] = taken
    return base, available, len(taken)


def normalize_question_text_key(text: str) -> str:
    return " ".join(str(text or "").lower().split())


def filter_by_stored_question_count(
    stmt: Select, *, min_questions: int | None = None, max_questions: int | None = None
) -> Select:
    if min_questions is None and max_questions is None:
        return stmt
    # Postgres: payload.questions faqat massiv bo'lsa uzunligini tekshiramiz.
    stmt = stmt.where(func.jsonb_typeof(PreparedContent.payload["questions"]) == "array")
    if min_questions is not None:
        stmt = stmt.where(func.jsonb_array_length(PreparedContent.payload["questions"]) >= min_questions)
    if max_questions is not None:
        stmt = stmt.where(func.jsonb_array_length(PreparedContent.payload["questions"]) <= max_questions)
    return stmt


def collect_unique_questions_from_tests(
    items: list[PreparedContent], *, shuffle: bool = True, count: int | None = None
) -> tuple[list[dict], int, int]:
    import random as _random

    seen: set[str] = set()
    pool: list[dict] = []
    tests_scanned = 0

    for item in items:
        tests_scanned += 1
        payload = item.payload if isinstance(item.payload, dict) else {}
        payload_refs = payload.get("references")
        payload_refs = list(payload_refs) if isinstance(payload_refs, list) and payload_refs else []
        raw_qs = payload.get("questions")
        if not isinstance(raw_qs, list):
            continue
        source_id = int(item.id or 0)
        for q in raw_qs:
            if not isinstance(q, dict):
                continue
            text = str(q.get("question") or q.get("text") or "").strip()
            if not text:
                continue
            key = normalize_question_text_key(text)
            if not key or key in seen:
                continue
            seen.add(key)
            row = dict(q)
            refs = row.get("references")
            if not (isinstance(refs, list) and refs) and payload_refs:
                row["references"] = list(payload_refs)
            if source_id > 0:
                row["source_test_id"] = source_id
            pool.append(row)

    available = len(pool)
    if shuffle and pool:
        _random.shuffle(pool)
    if count is not None:
        pool = pool[: max(0, int(count))]
    return pool, available, tests_scanned


def _now() -> dt_datetime:
    return dt_datetime.now(dt_timezone.utc)


def effective_subject_code(item: PreparedContent) -> str:
    code = (item.subject_code or "").strip()
    if code:
        return code
    if item.syllabus is not None:
        return (item.syllabus.subject_code or "").strip()
    return ""


def effective_subject_name(item: PreparedContent) -> str:
    name = (item.subject_name or "").strip()
    if name:
        return name
    if item.syllabus is not None:
        return (item.syllabus.subject_name or "").strip()
    return ""


def published_catalog_stmt() -> Select:
    cutoff = _now() - PUBLISH_DELAY
    return select(PreparedContent).where(
        PreparedContent.kind.in_(CATALOG_KINDS),
        PreparedContent.created_at <= cutoff,
    )


def is_published(item: PreparedContent) -> bool:
    return item.created_at <= _now() - PUBLISH_DELAY


def publish_at_iso(item: PreparedContent) -> str:
    return (item.created_at + PUBLISH_DELAY).isoformat()


def parse_topic_norm(topic_norm: str) -> dict[str, str]:
    raw = (topic_norm or "").strip()
    match = _TOPIC_NORM_RE.match(raw)
    if not match:
        return {"syllabus_id": "", "variant_label": "", "topic_code": ""}
    return {"syllabus_id": match.group(1), "variant_label": match.group(2), "topic_code": match.group(3)}


def enrich_catalog_meta(item: PreparedContent) -> tuple[str, str]:
    variant = (item.variant_label or "").strip()
    topic_code = (item.topic_code or "").strip()
    if variant and topic_code:
        return variant, topic_code
    parsed = parse_topic_norm(item.topic_norm)
    return variant or parsed["variant_label"], topic_code or parsed["topic_code"]


def question_count(item: PreparedContent) -> int:
    payload = item.payload if isinstance(item.payload, dict) else {}
    questions = payload.get("questions")
    return len(questions) if isinstance(questions, list) else 0


def catalog_verification_code(item: PreparedContent) -> str:
    settings = get_settings()
    raw = f"{item.id}:{item.created_at.isoformat()}:{item.kind}:{item.topic_norm}:{item.owner_key}"
    digest = hmac.new(settings.django_secret_key.encode("utf-8"), raw.encode("utf-8"), hashlib.sha256).hexdigest()
    return digest[:16].upper()


def catalog_document_id(item: PreparedContent) -> str:
    return f"IM-{item.id:06d}-{catalog_verification_code(item)[:8]}"


def catalog_item_summary(item: PreparedContent, *, include_verification: bool = False) -> dict:
    variant_label, topic_code = enrich_catalog_meta(item)
    dept_name = ""
    dept_code = ""
    catalog_subject_name = ""
    if item.syllabus is not None:
        catalog_subject_name = (item.syllabus.subject_name or "").strip()
        department = item.syllabus.department
        if department is not None:
            dept_name = department.name or ""
            dept_code = department.code or ""
    data = {
        "id": item.id,
        "kind": item.kind,
        "topic": item.topic,
        "topic_norm": item.topic_norm,
        "subject_name": item.subject_name or catalog_subject_name or effective_subject_name(item) or "",
        "subject_code": effective_subject_code(item) or item.subject_code or "",
        "department_name": dept_name,
        "department_code": dept_code,
        "variant_label": variant_label,
        "topic_code": topic_code,
        "syllabus_id": item.syllabus_id,
        "author_display_name": item.author_display_name or item.owner_key,
        "owner_key": item.owner_key,
        "created_at": item.created_at.isoformat(),
        "question_count": question_count(item),
        "is_published": is_published(item),
        "publish_at": publish_at_iso(item),
    }
    if include_verification:
        data["document_id"] = catalog_document_id(item)
        data["verification_code"] = catalog_verification_code(item)
    return data


def filter_catalog_stmt(stmt: Select, params: dict) -> Select:
    kind = (params.get("kind") or "").strip()
    if kind in CATALOG_KINDS:
        stmt = stmt.where(PreparedContent.kind == kind)

    subject_code = (params.get("subject_code") or "").strip()
    if subject_code:
        conds = [
            PreparedContent.subject_code == subject_code,
            PreparedContent.syllabus.has(CourseSyllabus.subject_code == subject_code),
        ]
        if "__" in subject_code:
            dept = subject_code.split("__", 1)[0].strip()
            if dept:
                conds.append(PreparedContent.subject_code == dept)
                conds.append(
                    PreparedContent.syllabus.has(
                        CourseSyllabus.department.has(AcademicDepartment.code == dept)
                    )
                )
        stmt = stmt.where(or_(*conds))

    department_code = (params.get("department_code") or "").strip()
    if department_code:
        stmt = stmt.where(
            or_(
                PreparedContent.syllabus.has(
                    CourseSyllabus.department.has(AcademicDepartment.code == department_code)
                ),
                PreparedContent.subject_code == department_code,
                PreparedContent.syllabus.has(
                    CourseSyllabus.subject_code.like(f"{department_code}__%")
                ),
            )
        )

    syllabus_id = (params.get("syllabus_id") or "").strip()
    if syllabus_id:
        try:
            stmt = stmt.where(PreparedContent.syllabus_id == int(syllabus_id))
        except (TypeError, ValueError):
            pass

    variant_label = (params.get("variant_label") or "").strip()
    if variant_label:
        stmt = stmt.where(func.lower(PreparedContent.variant_label) == variant_label.lower())

    topic_code = (params.get("topic_code") or "").strip()
    if topic_code:
        stmt = stmt.where(func.lower(PreparedContent.topic_code) == topic_code.lower())

    q = (params.get("q") or "").strip()
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                PreparedContent.topic.ilike(like),
                PreparedContent.subject_name.ilike(like),
                PreparedContent.author_display_name.ilike(like),
                PreparedContent.topic_norm.ilike(like),
                PreparedContent.variant_label.ilike(like),
                PreparedContent.topic_code.ilike(like),
            )
        )

    author = (params.get("author") or "").strip()
    if author:
        stmt = stmt.where(PreparedContent.author_display_name.ilike(f"%{author}%"))

    sort = (params.get("sort") or "subject").strip()
    if sort == "newest":
        return stmt.order_by(PreparedContent.created_at.desc())
    if sort == "topic":
        return stmt.order_by(PreparedContent.subject_name, PreparedContent.topic, PreparedContent.created_at.desc())
    return stmt.order_by(
        PreparedContent.subject_name,
        PreparedContent.variant_label,
        PreparedContent.topic_code,
        PreparedContent.topic,
        PreparedContent.created_at.desc(),
    )


def catalog_subjects_summary(db: Session) -> list[dict]:
    cutoff = _now() - PUBLISH_DELAY
    rows = db.execute(
        select(
            PreparedContent.subject_code,
            PreparedContent.subject_name,
            func.count(PreparedContent.id).filter(PreparedContent.kind == KIND_CASE).label("case_count"),
            func.count(PreparedContent.id).filter(PreparedContent.kind != KIND_CASE).label("test_count"),
        )
        .where(
            PreparedContent.kind.in_(CATALOG_KINDS),
            PreparedContent.created_at <= cutoff,
            PreparedContent.subject_name != "",
        )
        .group_by(PreparedContent.subject_code, PreparedContent.subject_name)
        .order_by(PreparedContent.subject_name)
    ).all()
    return [
        {
            "subject_code": r.subject_code or "",
            "subject_name": r.subject_name or "",
            "case_count": r.case_count,
            "test_count": r.test_count,
            "total_count": r.case_count + r.test_count,
        }
        for r in rows
    ]


def _syllabus_department_lookup(db: Session) -> dict[str, dict]:
    rows = db.execute(
        select(CourseSyllabus).where(CourseSyllabus.is_active.is_(True))
    ).scalars().all()
    lookup: dict[str, dict] = {}
    for obj in rows:
        lookup[obj.subject_code] = {
            "subject_name": obj.subject_name,
            "department_name": obj.department.name if obj.department else "",
            "department_code": obj.department.code if obj.department else "",
        }
    return lookup


def build_catalog_stats(db: Session, *, published_only: bool = False, kind: str | None = None) -> dict:
    now = _now()
    cutoff = now - PUBLISH_DELAY
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    stmt = select(PreparedContent)
    if kind in CATALOG_KINDS:
        stmt = stmt.where(PreparedContent.kind == kind)
    else:
        stmt = stmt.where(PreparedContent.kind.in_(CATALOG_KINDS))
    if published_only:
        stmt = stmt.where(PreparedContent.created_at <= cutoff)

    items = list(db.execute(stmt.order_by(PreparedContent.created_at.desc())).scalars().all())
    questions_total = sum(question_count(i) for i in items)
    published_count = sum(1 for i in items if is_published(i))
    pending_publish_count = len(items) - published_count

    authors = {i.owner_key for i in items}
    subjects = {(i.subject_code or "", i.subject_name or "") for i in items if i.subject_code}
    variants: set[tuple[str, str]] = set()
    topics: set[tuple[str, str, str]] = set()

    by_subject_map: dict[str, dict] = {}
    by_variant_map: dict[str, dict] = {}
    by_topic_map: dict[str, dict] = {}
    by_author_map: dict[str, dict] = {}

    for item in items:
        variant, topic_code = enrich_catalog_meta(item)
        subj_code = effective_subject_code(item)
        subj_name = effective_subject_name(item) or item.subject_name or ""
        qc = question_count(item)
        pub = is_published(item)
        is_case = item.kind == KIND_CASE

        if variant:
            variants.add((item.subject_code or "", variant))
        topics.add((item.subject_code or "", variant, topic_code or item.topic_norm or item.topic))

        subj_row = by_subject_map.setdefault(
            subj_code,
            {
                "subject_code": subj_code,
                "subject_name": subj_name,
                "case_count": 0,
                "test_count": 0,
                "questions_total": 0,
                "pending_publish_count": 0,
                "variants_distinct": set(),
                "topics_distinct": set(),
            },
        )
        subj_row["case_count" if is_case else "test_count"] += 1
        subj_row["questions_total"] += qc
        if not pub:
            subj_row["pending_publish_count"] += 1
        if variant:
            subj_row["variants_distinct"].add(variant)
        subj_row["topics_distinct"].add(topic_code or item.topic)

        if variant:
            var_key = f"{subj_code}::{variant}"
            var_row = by_variant_map.setdefault(
                var_key,
                {
                    "subject_code": subj_code,
                    "subject_name": subj_name,
                    "variant_label": variant,
                    "case_count": 0,
                    "test_count": 0,
                    "questions_total": 0,
                    "topics_distinct": set(),
                },
            )
            var_row["case_count" if is_case else "test_count"] += 1
            var_row["questions_total"] += qc
            var_row["topics_distinct"].add(topic_code or item.topic)

        topic_key = f"{subj_code}::{variant}::{topic_code or item.topic}"
        topic_row = by_topic_map.setdefault(
            topic_key,
            {
                "subject_code": subj_code,
                "subject_name": subj_name,
                "variant_label": variant,
                "topic_code": topic_code,
                "topic": item.topic,
                "case_count": 0,
                "test_count": 0,
                "questions_total": 0,
            },
        )
        topic_row["case_count" if is_case else "test_count"] += 1
        topic_row["questions_total"] += qc

        author_row = by_author_map.setdefault(
            item.owner_key,
            {
                "owner_key": item.owner_key,
                "author_display_name": item.author_display_name or item.owner_key,
                "case_count": 0,
                "test_count": 0,
                "questions_total": 0,
            },
        )
        author_row["case_count" if is_case else "test_count"] += 1
        author_row["questions_total"] += qc

    case_count = sum(1 for i in items if i.kind == KIND_CASE)
    test_count = sum(1 for i in items if i.kind != KIND_CASE)

    dept_lookup = _syllabus_department_lookup(db)

    def _apply_department_meta(row: dict) -> dict:
        meta = dept_lookup.get(row.get("subject_code") or "", {})
        row["department_name"] = meta.get("department_name", "")
        row["department_code"] = meta.get("department_code", "")
        if meta.get("subject_name") and not row.get("subject_name"):
            row["subject_name"] = meta["subject_name"]
        return row

    def _finalize_subject(row: dict) -> dict:
        out = dict(row)
        out["variants_distinct"] = len(out.pop("variants_distinct"))
        out["topics_distinct"] = len(out.pop("topics_distinct"))
        out["total_count"] = out["case_count"] + out["test_count"]
        return _apply_department_meta(out)

    def _finalize_variant(row: dict) -> dict:
        out = dict(row)
        out["topics_distinct"] = len(out.pop("topics_distinct"))
        out["total_count"] = out["case_count"] + out["test_count"]
        return _apply_department_meta(out)

    by_subject = sorted(
        (_finalize_subject(row) for row in by_subject_map.values()),
        key=lambda r: (r["subject_name"] or r["subject_code"] or "zzz"),
    )
    by_variant = sorted(
        (_finalize_variant(row) for row in by_variant_map.values()),
        key=lambda r: (r["subject_name"], r["variant_label"]),
    )
    by_topic = sorted(
        ({**row, "total_count": row["case_count"] + row["test_count"]} for row in by_topic_map.values()),
        key=lambda r: (-(r["test_count"] + r["case_count"]), r["subject_name"], r["topic"]),
    )[:50]
    by_author = sorted(
        ({**row, "total_count": row["case_count"] + row["test_count"]} for row in by_author_map.values()),
        key=lambda r: -r["total_count"],
    )[:30]

    recent = [catalog_item_summary(item) for item in items[:15]]

    return {
        "generated_at": now.isoformat(),
        "kind": kind or "all",
        "totals": {
            "case_count": case_count,
            "test_count": test_count,
            "total_count": len(items),
            "questions_total": questions_total,
            "published_count": published_count,
            "pending_publish_count": pending_publish_count,
            "authors_distinct": len(authors),
            "subjects_distinct": len(subjects),
            "variants_distinct": len(variants),
            "topics_distinct": len(topics),
            "created_last_7d": sum(1 for i in items if i.created_at >= week_ago),
            "created_last_30d": sum(1 for i in items if i.created_at >= month_ago),
        },
        "by_subject": by_subject,
        "by_variant": by_variant,
        "by_topic": by_topic,
        "by_author": by_author,
        "recent": recent,
    }
