from __future__ import annotations

import hashlib

from sqlalchemy import func, or_


def canonical_topic_norm(raw: str, topic: str = "") -> str:
    s = (raw or topic or "").strip().lower()
    if len(s) > 255:
        digest = hashlib.sha1(s.encode("utf-8")).hexdigest()[:12]
        s = f"{s[:240]}::{digest}"
    return s[:255]


def build_topic_norm(syllabus_id: int, variant_label: str, topic_code: str) -> str:
    variant = (variant_label or "").strip().lower()[:48]
    code = (topic_code or "").strip().lower().replace(" ", "")[:16]
    if not variant or not code:
        return ""
    return canonical_topic_norm(f"{int(syllabus_id)}::{variant}::{code}")


def topic_norm_query(column, norms: list[str]):
    variants: set[str] = set()
    for raw in norms:
        piece = (raw or "").strip()
        if not piece:
            continue
        variants.add(piece)
        variants.add(piece.lower())
        variants.add(canonical_topic_norm(piece))
    if not variants:
        return None
    return or_(*[func.lower(column) == v.lower() for v in variants])


def norms_from_params(params: dict, topic_norms: list[str] | None = None) -> list[str]:
    norms: list[str] = []
    syllabus_raw = (params.get("syllabus_id") or "").strip()
    variant_label = (params.get("variant_label") or "").strip()
    topic_code = (params.get("topic_code") or "").strip()
    if syllabus_raw and variant_label and topic_code:
        try:
            built = build_topic_norm(int(syllabus_raw), variant_label, topic_code)
        except (TypeError, ValueError):
            built = ""
        if built:
            norms.append(built)
    for n in topic_norms or []:
        n = n.strip()
        if n:
            norms.append(n)
    single = (params.get("topic_norm") or "").strip()
    if single and single not in norms:
        norms.append(single)
    return norms
