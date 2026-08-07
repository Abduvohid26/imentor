"""Keys va testlar umumiy bazasi — yaratilishi bilan e'lon qilinadi."""

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
# 0 = darhol e'lon (oldingi 1 soatlik kechikish olib tashlandi).
PUBLISH_DELAY = timedelta(0)
TEST_QUESTION_LIMIT_MIN = 10
TEST_QUESTION_LIMIT_MAX = 30
_TOPIC_NORM_RE = re.compile(r'^(\d+)::([^:]+)::(.+)$')


def effective_subject_code(item: PreparedContent) -> str:
    """subject_code yoki syllabus FK orqali barqaror fan kodi."""
    code = (item.subject_code or '').strip()
    if code:
        return code
    syllabus = getattr(item, 'syllabus', None)
    if syllabus is not None:
        return (getattr(syllabus, 'subject_code', None) or '').strip()
    return ''


def effective_subject_name(item: PreparedContent) -> str:
    name = (item.subject_name or '').strip()
    if name:
        return name
    syllabus = getattr(item, 'syllabus', None)
    if syllabus is not None:
        return (getattr(syllabus, 'subject_name', None) or '').strip()
    return ''


def published_catalog_queryset():
    cutoff = timezone.now() - PUBLISH_DELAY
    return PreparedContent.objects.filter(
        kind__in=CATALOG_KINDS,
        created_at__lte=cutoff,
    ).select_related('syllabus', 'syllabus__department')


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


def stored_question_count_from_payload(payload: dict | None) -> int:
    if not isinstance(payload, dict):
        return 0
    questions = payload.get('questions')
    return len(questions) if isinstance(questions, list) else 0


def parse_test_question_limit(value: str | None, *, param_name: str = 'question_limit') -> tuple[int | None, str | None]:
    """Tashqi API: savollar soni 10–30 oralig'ida."""
    if value is None or not str(value).strip():
        return None, None
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        return None, (
            f'{param_name} must be an integer between '
            f'{TEST_QUESTION_LIMIT_MIN} and {TEST_QUESTION_LIMIT_MAX}.'
        )
    if parsed < TEST_QUESTION_LIMIT_MIN or parsed > TEST_QUESTION_LIMIT_MAX:
        return None, (
            f'{param_name} must be between '
            f'{TEST_QUESTION_LIMIT_MIN} and {TEST_QUESTION_LIMIT_MAX}.'
        )
    return parsed, None


SUPPORTED_TEST_LANGUAGES = ('uz', 'ru', 'en')


def parse_test_language(value: str | None, *, param_name: str = 'language') -> tuple[str | None, str | None]:
    """Ixtiyoriy til: uz|ru|en. Bo'sh → None (primary til)."""
    if value is None or not str(value).strip():
        return None, None
    lang = str(value).strip().lower()
    if lang not in SUPPORTED_TEST_LANGUAGES:
        return None, f"{param_name} must be one of: {', '.join(SUPPORTED_TEST_LANGUAGES)}."
    return lang, None


def primary_test_language(payload: dict | None) -> str:
    if not isinstance(payload, dict):
        return 'uz'
    raw = payload.get('primaryLanguage') or payload.get('primary_language') or 'uz'
    lang = str(raw or 'uz').strip().lower()
    return lang if lang in SUPPORTED_TEST_LANGUAGES else 'uz'


def available_test_languages(payload: dict | None) -> list[str]:
    if not isinstance(payload, dict):
        return ['uz']
    primary = primary_test_language(payload)
    langs = [primary]
    tr = payload.get('translations')
    primary_qs = payload.get('questions') if isinstance(payload.get('questions'), list) else []
    if isinstance(tr, dict):
        for code in SUPPORTED_TEST_LANGUAGES:
            if code in langs:
                continue
            block = tr.get(code)
            if not isinstance(block, dict):
                continue
            qs = block.get('questions')
            if not isinstance(qs, list) or not qs:
                continue
            usable = 0
            for i, tq in enumerate(qs):
                pq = primary_qs[i] if i < len(primary_qs) and isinstance(primary_qs[i], dict) else None
                if _is_usable_translation_block(
                    lang=code,
                    primary=primary,
                    primary_q=pq,
                    translated_q=tq if isinstance(tq, dict) else None,
                ):
                    usable += 1
            if usable >= max(1, int(len(qs) * 0.6)):
                langs.append(code)
    return langs


def project_test_payload_language(payload: dict | None, language: str | None) -> tuple[dict, str]:
    """Top-level topic/questions ni so'ralgan tilga chiqaradi. Qaytadi: (payload, actual_language)."""
    base = dict(payload) if isinstance(payload, dict) else {}
    primary = primary_test_language(base)
    wanted = (language or primary).strip().lower()
    if wanted not in SUPPORTED_TEST_LANGUAGES:
        wanted = primary

    if wanted == primary:
        out = dict(base)
        if 'primaryLanguage' not in out:
            out['primaryLanguage'] = primary
        return out, primary

    tr = base.get('translations')
    block = tr.get(wanted) if isinstance(tr, dict) else None
    if not isinstance(block, dict) or not isinstance(block.get('questions'), list) or not block['questions']:
        out = dict(base)
        if 'primaryLanguage' not in out:
            out['primaryLanguage'] = primary
        return out, primary

    primary_qs = base.get('questions') if isinstance(base.get('questions'), list) else []
    usable = 0
    for i, tq in enumerate(block['questions']):
        pq = primary_qs[i] if i < len(primary_qs) and isinstance(primary_qs[i], dict) else None
        if _is_usable_translation_block(
            lang=wanted,
            primary=primary,
            primary_q=pq,
            translated_q=tq if isinstance(tq, dict) else None,
        ):
            usable += 1
    if usable < max(1, int(len(block['questions']) * 0.6)):
        out = dict(base)
        if 'primaryLanguage' not in out:
            out['primaryLanguage'] = primary
        return out, primary

    out = dict(base)
    out['topic'] = block.get('topic') or base.get('topic')
    out['questions'] = list(block['questions'])
    if isinstance(block.get('references'), list):
        out['references'] = list(block['references'])
    translations = dict(tr) if isinstance(tr, dict) else {}
    if primary not in translations and isinstance(base.get('questions'), list):
        primary_block = {
            'topic': base.get('topic'),
            'questions': list(base['questions']),
        }
        if isinstance(base.get('references'), list):
            primary_block['references'] = list(base['references'])
        translations[primary] = primary_block
    out['translations'] = translations
    if 'primaryLanguage' not in out:
        out['primaryLanguage'] = primary
    return out, wanted


def slice_test_payload(payload: dict | None, limit: int | None) -> tuple[dict, int, int]:
    """
    payload.questions ni limit bo'yicha qisqartiradi.
    Qaytadi: (yangi payload, available_count, returned_count)
    """
    base = dict(payload) if isinstance(payload, dict) else {}
    questions = base.get('questions')
    if not isinstance(questions, list):
        base['questions'] = []
        return base, 0, 0
    available = len(questions)
    if limit is None:
        return base, available, available
    taken = questions[:limit]
    base['questions'] = taken
    tr = base.get('translations')
    if isinstance(tr, dict):
        next_tr = {}
        for lang, block in tr.items():
            if not isinstance(block, dict):
                continue
            qs = block.get('questions')
            if isinstance(qs, list):
                next_tr[lang] = {**block, 'questions': qs[:limit]}
            else:
                next_tr[lang] = block
        base['translations'] = next_tr
    return base, available, len(taken)


def normalize_question_text_key(text: str) -> str:
    """Unique solishtirish: lower + ortiqcha bo'shliqlarni yig'ish."""
    return ' '.join(str(text or '').lower().split())


def _payload_level_references(payload: dict) -> list:
    refs = payload.get('references')
    return list(refs) if isinstance(refs, list) and refs else []


_UZ_MARKERS = (
    'bemor',
    'yoshli',
    'qaysi',
    'ushbu',
    'hisoblanadi',
    'murojaat',
    'aniqlanadi',
    'tavsiya',
    "bo'lib",
    'shifokorga',
    'davosida',
)


def _looks_like_uzbek(text: str) -> bool:
    s = (text or '').lower()
    return sum(1 for m in _UZ_MARKERS if m in s) >= 2


def _cyrillic_count(text: str) -> int:
    return sum(1 for ch in (text or '') if '\u0400' <= ch <= '\u04FF')


def _question_text_block(q: dict) -> dict | None:
    text = str(q.get('question') or q.get('text') or '').strip()
    if not text:
        return None
    options = q.get('options')
    block = {
        'question': text,
        'options': list(options) if isinstance(options, list) else [],
        'explanation': str(q.get('explanation') or '').strip(),
    }
    opt_expl = q.get('optionExplanations')
    if isinstance(opt_expl, list) and any(str(x or '').strip() for x in opt_expl):
        block['optionExplanations'] = [str(x or '').strip() for x in opt_expl[:5]]
    return block


def _is_usable_translation_block(
    *,
    lang: str,
    primary: str,
    primary_q: dict | None,
    translated_q: dict | None,
) -> bool:
    if lang == primary:
        return True
    if not isinstance(translated_q, dict):
        return False
    text = str(translated_q.get('question') or translated_q.get('text') or '').strip()
    if not text:
        return False
    src = ''
    if isinstance(primary_q, dict):
        src = str(primary_q.get('question') or primary_q.get('text') or '').strip()
    if src and normalize_question_text_key(text) == normalize_question_text_key(src):
        return False
    if lang == 'ru':
        if _cyrillic_count(text) < 8:
            return False
        if _looks_like_uzbek(text):
            return False
    if lang == 'en' and _looks_like_uzbek(text):
        return False
    return True


def _questions_lists_by_language(payload: dict) -> dict[str, list]:
    by_lang: dict[str, list] = {}
    primary = primary_test_language(payload)
    primary_qs = payload.get('questions')
    if isinstance(primary_qs, list):
        by_lang[primary] = primary_qs
    tr = payload.get('translations')
    if isinstance(tr, dict):
        for code in SUPPORTED_TEST_LANGUAGES:
            block = tr.get(code)
            if not isinstance(block, dict):
                continue
            qs = block.get('questions')
            if isinstance(qs, list) and qs:
                by_lang[code] = qs
    return by_lang


def collect_unique_questions_from_tests(
    items,
    *,
    shuffle: bool = True,
    count: int | None = None,
    rng=None,
    language: str | None = None,
) -> tuple[list[dict], int, int]:
    """
    Unique savollar pooli — har bir savol `languages` (uz/ru/en) bilan.
    Unique = primary til matni. Savolda references yo'q bo'lsa — payload.references.
    """
    import random as _random

    seen: set[str] = set()
    pool: list[dict] = []
    tests_scanned = 0
    only_lang = (language or '').strip().lower() or None
    if only_lang and only_lang not in SUPPORTED_TEST_LANGUAGES:
        only_lang = None

    for item in items:
        tests_scanned += 1
        raw_payload = item.payload if isinstance(getattr(item, 'payload', None), dict) else {}
        if not isinstance(raw_payload, dict):
            raw_payload = {}
        payload_refs = _payload_level_references(raw_payload)
        by_lang = _questions_lists_by_language(raw_payload)
        primary = primary_test_language(raw_payload)
        primary_qs = by_lang.get(primary) or next(iter(by_lang.values()), None)
        if not isinstance(primary_qs, list):
            continue
        source_id = int(getattr(item, 'pk', 0) or 0)

        for i, q in enumerate(primary_qs):
            if not isinstance(q, dict):
                continue
            languages: dict[str, dict] = {}
            primary_q = primary_qs[i] if isinstance(primary_qs[i], dict) else None
            for code in SUPPORTED_TEST_LANGUAGES:
                qs = by_lang.get(code)
                if not isinstance(qs, list) or i >= len(qs) or not isinstance(qs[i], dict):
                    continue
                if not _is_usable_translation_block(
                    lang=code,
                    primary=primary,
                    primary_q=primary_q,
                    translated_q=qs[i],
                ):
                    continue
                block = _question_text_block(qs[i])
                if block:
                    languages[code] = block
            if not languages:
                continue
            if only_lang:
                if only_lang not in languages:
                    continue
                languages = {only_lang: languages[only_lang]}

            key_src = languages.get(primary) or next(iter(languages.values()))
            key = normalize_question_text_key(key_src.get('question') or '')
            if not key or key in seen:
                continue
            seen.add(key)

            correct = q.get('correctOptionIndex')
            if not isinstance(correct, int):
                correct = 0
            refs = q.get('references')
            if not (isinstance(refs, list) and refs):
                refs = payload_refs
            row = {
                'correctOptionIndex': correct,
                'available_languages': list(languages.keys()),
                'languages': languages,
            }
            if isinstance(refs, list) and refs:
                row['references'] = list(refs)
            if source_id > 0:
                row['source_test_id'] = source_id
            pool.append(row)

    available = len(pool)
    picker = rng if rng is not None else _random
    if shuffle and pool:
        picker.shuffle(pool)
    if count is not None:
        pool = pool[: max(0, int(count))]
    return pool, available, tests_scanned


def annotate_stored_question_count(qs):
    from django.db import connection
    from django.db.models import IntegerField
    from django.db.models.expressions import RawSQL

    if connection.vendor != 'postgresql':
        return qs
    return qs.annotate(
        _stored_question_count=RawSQL(
            "(CASE WHEN jsonb_typeof(payload->'questions') = 'array' "
            "THEN jsonb_array_length(payload->'questions') ELSE 0 END)::integer",
            [],
            output_field=IntegerField(),
        )
    )


def filter_by_stored_question_count(qs, *, min_questions: int | None = None, max_questions: int | None = None):
    if min_questions is None and max_questions is None:
        return qs
    from django.db import connection

    if connection.vendor == 'postgresql':
        qs = annotate_stored_question_count(qs)
        if min_questions is not None:
            qs = qs.filter(_stored_question_count__gte=min_questions)
        if max_questions is not None:
            qs = qs.filter(_stored_question_count__lte=max_questions)
        return qs

    # SQLite test DB: qs may already use select_related; .only() on that queryset raises FieldError.
    scan_qs = PreparedContent.objects.filter(pk__in=qs.values_list('pk', flat=True)).only('pk', 'payload')
    matching_pks = []
    for item in scan_qs:
        count = question_count(item)
        if min_questions is not None and count < min_questions:
            continue
        if max_questions is not None and count > max_questions:
            continue
        matching_pks.append(item.pk)
    return qs.filter(pk__in=matching_pks)


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
    dept_name = ''
    dept_code = ''
    catalog_subject_name = ''
    syllabus = getattr(item, 'syllabus', None)
    if syllabus is not None and getattr(syllabus, 'pk', None):
        catalog_subject_name = (syllabus.subject_name or '').strip()
        department = getattr(syllabus, 'department', None)
        if department is not None and getattr(department, 'pk', None):
            dept_name = department.name or ''
            dept_code = department.code or ''
    data = {
        'id': item.id,
        'kind': item.kind,
        'topic': item.topic,
        'topic_norm': item.topic_norm,
        'subject_name': item.subject_name or catalog_subject_name or effective_subject_name(item) or '',
        'subject_code': effective_subject_code(item) or item.subject_code or '',
        'department_name': dept_name,
        'department_code': dept_code,
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
        # Aniq fan kodi + syllabus.subject_code.
        # Legacy: ba'zi testlar faqat kafedra kodi (dept) bilan saqlangan —
        # katalog fan kodi dept__fan bo'lsa, dept bo'yicha ham topiladi.
        subject_q = Q(subject_code=subject_code) | Q(syllabus__subject_code=subject_code)
        if '__' in subject_code:
            dept = subject_code.split('__', 1)[0].strip()
            if dept:
                subject_q |= Q(subject_code=dept)
                subject_q |= Q(syllabus__department__code=dept)
        qs = qs.filter(subject_q)

    department_code = (params.get('department_code') or '').strip()
    if department_code:
        qs = qs.filter(
            Q(syllabus__department__code=department_code)
            | Q(subject_code=department_code)
            | Q(syllabus__subject_code__startswith=f'{department_code}__')
        )

    syllabus_id = (params.get('syllabus_id') or '').strip()
    if syllabus_id:
        try:
            qs = qs.filter(syllabus_id=int(syllabus_id))
        except (TypeError, ValueError):
            pass

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
        base_qs = base_qs.filter(created_at__lte=cutoff).select_related('syllabus', 'syllabus__department')

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
        subj_code = effective_subject_code(item)
        subj_name = effective_subject_name(item) or item.subject_name or ''
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

    from .external_catalog_service import syllabus_department_lookup

    dept_lookup = syllabus_department_lookup()

    def _apply_department_meta(row: dict) -> dict:
        meta = dept_lookup.get(row.get('subject_code') or '', {})
        row['department_name'] = meta.get('department_name', '')
        row['department_code'] = meta.get('department_code', '')
        if meta.get('subject_name') and not row.get('subject_name'):
            row['subject_name'] = meta['subject_name']
        return row

    def _finalize_subject(row: dict) -> dict:
        out = dict(row)
        out['variants_distinct'] = len(out.pop('variants_distinct'))
        out['topics_distinct'] = len(out.pop('topics_distinct'))
        out['total_count'] = out['case_count'] + out['test_count']
        return _apply_department_meta(out)

    def _finalize_variant(row: dict) -> dict:
        out = dict(row)
        out['topics_distinct'] = len(out.pop('topics_distinct'))
        out['total_count'] = out['case_count'] + out['test_count']
        return _apply_department_meta(out)

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

