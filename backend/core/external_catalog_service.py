"""Tashqi hamkorlar uchun syllabus katalogi (kafedra → fan → yo'nalish → mavzu)."""

from __future__ import annotations

from django.db.models import Q

from .models import AcademicDepartment, CourseSyllabus
from .syllabus_catalog_views import build_syllabus_catalog_stats


def _topic_rows(topics: list) -> list[dict]:
    rows = []
    for topic in topics or []:
        if not isinstance(topic, dict):
            continue
        topic_id = (topic.get('id') or topic.get('code') or '').strip()
        title = (topic.get('title') or topic.get('name') or topic_id).strip()
        if not topic_id and not title:
            continue
        rows.append({'id': topic_id, 'title': title})
    return rows


def _variants_for(obj: CourseSyllabus) -> list[dict]:
    raw = obj.variants or []
    if raw:
        return [
            {
                'label': (v.get('label') or 'Asosiy').strip(),
                'file_name': (v.get('file_name') or '').strip(),
                'topics': _topic_rows(v.get('topics') or []),
            }
            for v in raw
            if isinstance(v, dict)
        ]
    if obj.topics:
        return [
            {
                'label': 'Asosiy',
                'file_name': (obj.file_name or '').strip(),
                'topics': _topic_rows(obj.topics),
            }
        ]
    return []


def external_catalog_subject_summary(obj: CourseSyllabus) -> dict:
    variants = _variants_for(obj)
    topics_count = sum(len(v['topics']) for v in variants)
    return {
        'id': obj.pk,
        'subject_code': obj.subject_code,
        'subject_name': obj.subject_name,
        'department_code': obj.department.code if obj.department_id else '',
        'department_name': obj.department.name if obj.department_id else '',
        'instruction_language': obj.instruction_language or 'uz',
        'variants_count': len(variants),
        'topics_count': topics_count,
        'variant_labels': [v['label'] for v in variants],
    }


def external_catalog_subject_detail(obj: CourseSyllabus) -> dict:
    summary = external_catalog_subject_summary(obj)
    summary['variants'] = _variants_for(obj)
    return summary


def syllabus_department_lookup() -> dict[str, dict]:
    """subject_code → kafedra/fan nomlari (tashqi API va statistika uchun)."""
    rows = CourseSyllabus.objects.filter(is_active=True).select_related('department')
    lookup: dict[str, dict] = {}
    for obj in rows:
        lookup[obj.subject_code] = {
            'subject_code': obj.subject_code,
            'subject_name': obj.subject_name,
            'department_name': obj.department.name if obj.department_id else '',
            'department_code': obj.department.code if obj.department_id else '',
            'syllabus_id': obj.pk,
        }
    return lookup


def external_catalog_subjects_for_department(department_code: str) -> list[dict]:
    code = (department_code or '').strip()
    qs = active_syllabus_queryset().filter(department__code=code)
    rows = []
    for obj in qs:
        summary = external_catalog_subject_summary(obj)
        if summary['topics_count'] > 0:
            rows.append(summary)
    return rows


def external_department_detail(department_code: str) -> dict | None:
    code = (department_code or '').strip()
    dept = AcademicDepartment.objects.filter(is_active=True, code=code).first()
    if not dept:
        return None
    subjects = external_catalog_subjects_for_department(code)
    return {
        'code': dept.code,
        'name': dept.name,
        'sort_order': dept.sort_order,
        'subjects_count': len(subjects),
        'subjects': subjects,
    }


def build_external_catalog_stats() -> dict:
    base = build_syllabus_catalog_stats()
    by_subject = []
    for obj in active_syllabus_queryset():
        summary = external_catalog_subject_summary(obj)
        if summary['topics_count'] > 0:
            by_subject.append(summary)
    by_subject.sort(key=lambda r: (r['department_name'] or 'zzz', r['subject_name'] or r['subject_code']))
    return {
        'departments_count': base['departments_count'],
        'subjects_count': base['subjects_count'],
        'variants_count': base['variants_count'],
        'topics_count': base['topics_count'],
        'by_department': base['by_department'],
        'by_subject': by_subject,
    }


def external_departments_list():
    return list(
        AcademicDepartment.objects.filter(is_active=True)
        .order_by('sort_order', 'name')
        .values('code', 'name', 'sort_order')
    )


def active_syllabus_queryset():
    return (
        CourseSyllabus.objects.filter(is_active=True)
        .select_related('department')
        .order_by('sort_order', 'subject_name')
    )


def filter_external_subjects(qs, params):
    department_code = (params.get('department_code') or '').strip()
    if department_code:
        qs = qs.filter(department__code=department_code)

    q = (params.get('q') or '').strip()
    if q:
        qs = qs.filter(Q(subject_name__icontains=q) | Q(subject_code__icontains=q))
    return qs
