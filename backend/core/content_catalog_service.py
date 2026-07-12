"""Keys va testlar umumiy bazasi — darsdan 1 soat keyin e'lon qilinadi."""

from __future__ import annotations

import hashlib
import hmac
import re
from datetime import timedelta

from django.conf import settings
from django.db.models import Count, Q
from django.utils import timezone

from .models import PreparedContent

CATALOG_KINDS = (PreparedContent.KIND_CASE, PreparedContent.KIND_TEST)
PUBLISH_DELAY = timedelta(hours=1)
_TOPIC_NORM_RE = re.compile(r'^(\d+)::([^:]+)::(.+)$')


def published_catalog_queryset():
    cutoff = timezone.now() - PUBLISH_DELAY
    return PreparedContent.objects.filter(
        kind__in=CATALOG_KINDS,
        created_at__lte=cutoff,
    )


def is_published(item: PreparedContent) -> bool:
    return item.created_at <= timezone.now() - PUBLISH_DELAY


def publish_at_iso(item: PreparedContent) -> str:
    return (item.created_at + PUBLISH_DELAY).isoformat()


def parse_topic_norm(topic_norm: str) -> dict[str, str]:
    """`{syllabusId}::{variant}::{topicCode}` yoki eski title kalit."""
    raw = (topic_norm or '').strip()
    match = _TOPIC_NORM_RE.match(raw)
    if not match:
        return {'syllabus_id': '', 'variant_label': '', 'topic_code': ''}
    return {
        'syllabus_id': match.group(1),
        'variant_label': match.group(2),
        'topic_code': match.group(3),
    }


def enrich_catalog_meta(item: PreparedContent) -> tuple[str, str]:
    variant = (item.variant_label or '').strip()
    topic_code = (item.topic_code or '').strip()
    if variant and topic_code:
        return variant, topic_code
    parsed = parse_topic_norm(item.topic_norm)
    return variant or parsed['variant_label'], topic_code or parsed['topic_code']


def question_count(item: PreparedContent) -> int:
    payload = item.payload if isinstance(item.payload, dict) else {}
    questions = payload.get('questions')
    return len(questions) if isinstance(questions, list) else 0


def catalog_verification_code(item: PreparedContent) -> str:
    """Hujjatni soxtalashtirishni qiyinlashtirish uchun barqaror tasdiqlash kodi."""
    raw = f"{item.id}:{item.created_at.isoformat()}:{item.kind}:{item.topic_norm}:{item.owner_key}"
    digest = hmac.new(
        settings.SECRET_KEY.encode('utf-8'),
        raw.encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()
    return digest[:16].upper()


def catalog_document_id(item: PreparedContent) -> str:
    return f"IM-{item.id:06d}-{catalog_verification_code(item)[:8]}"


def catalog_item_summary(item: PreparedContent, *, include_verification: bool = False) -> dict:
    variant_label, topic_code = enrich_catalog_meta(item)
    data = {
        'id': item.id,
        'kind': item.kind,
        'topic': item.topic,
        'topic_norm': item.topic_norm,
        'subject_name': item.subject_name or '',
        'subject_code': item.subject_code or '',
        'variant_label': variant_label,
        'topic_code': topic_code,
        'syllabus_id': item.syllabus_id,
        'author_display_name': item.author_display_name or item.owner_key,
        'owner_key': item.owner_key,
        'created_at': item.created_at.isoformat(),
        'question_count': question_count(item),
        'is_published': is_published(item),
        'publish_at': publish_at_iso(item),
    }
    if include_verification:
        data['document_id'] = catalog_document_id(item)
        data['verification_code'] = catalog_verification_code(item)
    return data


def filter_catalog_queryset(qs, params) -> object:
    kind = (params.get('kind') or '').strip()
    if kind in CATALOG_KINDS:
        qs = qs.filter(kind=kind)

    subject_code = (params.get('subject_code') or '').strip()
    if subject_code:
        qs = qs.filter(subject_code=subject_code)

    variant_label = (params.get('variant_label') or '').strip()
    if variant_label:
        qs = qs.filter(variant_label__iexact=variant_label)

    topic_code = (params.get('topic_code') or '').strip()
    if topic_code:
        qs = qs.filter(topic_code__iexact=topic_code)

    q = (params.get('q') or '').strip()
    if q:
        qs = qs.filter(
            Q(topic__icontains=q)
            | Q(subject_name__icontains=q)
            | Q(author_display_name__icontains=q)
            | Q(topic_norm__icontains=q)
            | Q(variant_label__icontains=q)
            | Q(topic_code__icontains=q)
        )

    author = (params.get('author') or '').strip()
    if author:
        qs = qs.filter(author_display_name__icontains=author)

    sort = (params.get('sort') or 'subject').strip()
    if sort == 'newest':
        return qs.order_by('-created_at')
    if sort == 'topic':
        return qs.order_by('subject_name', 'topic', '-created_at')
    return qs.order_by('subject_name', 'variant_label', 'topic_code', 'topic', '-created_at')


def catalog_subjects_summary():
    cutoff = timezone.now() - PUBLISH_DELAY
    rows = (
        PreparedContent.objects.filter(
            kind__in=CATALOG_KINDS,
            created_at__lte=cutoff,
        )
        .exclude(subject_name='')
        .values('subject_code', 'subject_name')
        .annotate(
            case_count=Count('id', filter=Q(kind=PreparedContent.KIND_CASE)),
            test_count=Count('id', filter=Q(kind=PreparedContent.KIND_TEST)),
        )
        .order_by('subject_name')
    )
    return [
        {
            'subject_code': r['subject_code'] or '',
            'subject_name': r['subject_name'] or '',
            'case_count': r['case_count'],
            'test_count': r['test_count'],
            'total_count': r['case_count'] + r['test_count'],
        }
        for r in rows
    ]


def _kind_filter(kind: str | None):
    if kind in CATALOG_KINDS:
        return Q(kind=kind)
    return Q(kind__in=CATALOG_KINDS)


def build_catalog_stats(*, published_only: bool = False, kind: str | None = None) -> dict:
    now = timezone.now()
    cutoff = now - PUBLISH_DELAY
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    base_qs = PreparedContent.objects.filter(_kind_filter(kind))
    if published_only:
        base_qs = base_qs.filter(created_at__lte=cutoff)

    items = list(base_qs.order_by('-created_at'))
    questions_total = sum(question_count(item) for item in items)
    published_count = sum(1 for item in items if is_published(item))
    pending_publish_count = len(items) - published_count

    authors = {item.owner_key for item in items}
    subjects = {(item.subject_code or '', item.subject_name or '') for item in items if item.subject_code}
    variants = set()
    topics = set()
    for item in items:
        variant, topic_code = enrich_catalog_meta(item)
        if variant:
            variants.add((item.subject_code or '', variant))
        topic_key = (
            item.subject_code or '',
            variant,
            topic_code or item.topic_norm or item.topic,
        )
        topics.add(topic_key)

    by_subject_map: dict[str, dict] = {}
    by_variant_map: dict[str, dict] = {}
    by_topic_map: dict[str, dict] = {}
    by_author_map: dict[str, dict] = {}

    for item in items:
        variant, topic_code = enrich_catalog_meta(item)
        subj_code = item.subject_code or ''
        subj_name = item.subject_name or ''
        qc = question_count(item)
        pub = is_published(item)

        subj_row = by_subject_map.setdefault(
            subj_code,
            {
                'subject_code': subj_code,
                'subject_name': subj_name,
                'case_count': 0,
                'test_count': 0,
                'questions_total': 0,
                'pending_publish_count': 0,
                'variants_distinct': set(),
                'topics_distinct': set(),
            },
        )
        if item.kind == PreparedContent.KIND_CASE:
            subj_row['case_count'] += 1
        else:
            subj_row['test_count'] += 1
        subj_row['questions_total'] += qc
        if not pub:
            subj_row['pending_publish_count'] += 1
        if variant:
            subj_row['variants_distinct'].add(variant)
        subj_row['topics_distinct'].add(topic_code or item.topic)

        if variant:
            var_key = f'{subj_code}::{variant}'
            var_row = by_variant_map.setdefault(
                var_key,
                {
                    'subject_code': subj_code,
                    'subject_name': subj_name,
                    'variant_label': variant,
                    'case_count': 0,
                    'test_count': 0,
                    'questions_total': 0,
                    'topics_distinct': set(),
                },
            )
            if item.kind == PreparedContent.KIND_CASE:
                var_row['case_count'] += 1
            else:
                var_row['test_count'] += 1
            var_row['questions_total'] += qc
            var_row['topics_distinct'].add(topic_code or item.topic)

        topic_key = f'{subj_code}::{variant}::{topic_code or item.topic}'
        topic_row = by_topic_map.setdefault(
            topic_key,
            {
                'subject_code': subj_code,
                'subject_name': subj_name,
                'variant_label': variant,
                'topic_code': topic_code,
                'topic': item.topic,
                'case_count': 0,
                'test_count': 0,
                'questions_total': 0,
            },
        )
        if item.kind == PreparedContent.KIND_CASE:
            topic_row['case_count'] += 1
        else:
            topic_row['test_count'] += 1
        topic_row['questions_total'] += qc

        author_key = item.owner_key
        author_row = by_author_map.setdefault(
            author_key,
            {
                'owner_key': author_key,
                'author_display_name': item.author_display_name or author_key,
                'case_count': 0,
                'test_count': 0,
                'questions_total': 0,
            },
        )
        if item.kind == PreparedContent.KIND_CASE:
            author_row['case_count'] += 1
        else:
            author_row['test_count'] += 1
        author_row['questions_total'] += qc

    case_count = sum(1 for item in items if item.kind == PreparedContent.KIND_CASE)
    test_count = sum(1 for item in items if item.kind == PreparedContent.KIND_TEST)

    def _finalize_subject(row: dict) -> dict:
        out = dict(row)
        out['variants_distinct'] = len(out.pop('variants_distinct'))
        out['topics_distinct'] = len(out.pop('topics_distinct'))
        out['total_count'] = out['case_count'] + out['test_count']
        return out

    def _finalize_variant(row: dict) -> dict:
        out = dict(row)
        out['topics_distinct'] = len(out.pop('topics_distinct'))
        out['total_count'] = out['case_count'] + out['test_count']
        return out

    by_subject = sorted(
        (_finalize_subject(row) for row in by_subject_map.values()),
        key=lambda r: (r['subject_name'] or r['subject_code'] or 'zzz'),
    )
    by_variant = sorted(
        (_finalize_variant(row) for row in by_variant_map.values()),
        key=lambda r: (r['subject_name'], r['variant_label']),
    )
    by_topic = sorted(
        (
            {**row, 'total_count': row['case_count'] + row['test_count']}
            for row in by_topic_map.values()
        ),
        key=lambda r: (-(r['test_count'] + r['case_count']), r['subject_name'], r['topic']),
    )[:50]
    by_author = sorted(
        (
            {**row, 'total_count': row['case_count'] + row['test_count']}
            for row in by_author_map.values()
        ),
        key=lambda r: -r['total_count'],
    )[:30]

    recent = [
        catalog_item_summary(item)
        for item in items[:15]
    ]

    return {
        'generated_at': now.isoformat(),
        'kind': kind or 'all',
        'totals': {
            'case_count': case_count,
            'test_count': test_count,
            'total_count': len(items),
            'questions_total': questions_total,
            'published_count': published_count,
            'pending_publish_count': pending_publish_count,
            'authors_distinct': len(authors),
            'subjects_distinct': len(subjects),
            'variants_distinct': len(variants),
            'topics_distinct': len(topics),
            'created_last_7d': sum(1 for item in items if item.created_at >= week_ago),
            'created_last_30d': sum(1 for item in items if item.created_at >= month_ago),
        },
        'by_subject': by_subject,
        'by_variant': by_variant,
        'by_topic': by_topic,
        'by_author': by_author,
        'recent': recent,
    }

