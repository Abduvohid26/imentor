"""Tashqi servislar uchun test bazasi API (API kalit bilan)."""

from __future__ import annotations

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from .content_catalog_service import (
    SUPPORTED_TEST_LANGUAGES,
    TEST_QUESTION_LIMIT_MAX,
    TEST_QUESTION_LIMIT_MIN,
    available_test_languages,
    build_catalog_stats,
    catalog_item_summary,
    collect_unique_questions_from_tests,
    filter_by_stored_question_count,
    filter_catalog_queryset,
    parse_test_language,
    parse_test_question_limit,
    project_test_payload_language,
    published_catalog_queryset,
    slice_test_payload,
)
from .models import PreparedContent
from .pagination import paginated_response


def external_api_keys() -> frozenset[str]:
    raw = getattr(settings, 'EXTERNAL_API_KEYS', '') or ''
    return frozenset(part.strip() for part in raw.split(',') if part.strip())


class HasExternalApiKey(BasePermission):
    message = 'Valid X-Api-Key header required.'

    def has_permission(self, request, view) -> bool:
        keys = external_api_keys()
        if not keys:
            return False
        header = (request.headers.get('X-Api-Key') or request.META.get('HTTP_X_API_KEY') or '').strip()
        return bool(header) and header in keys


def _parse_list_question_filters(params) -> tuple[int | None, int | None, str | None]:
    min_q, err = parse_test_question_limit(params.get('min_questions'), param_name='min_questions')
    if err:
        return None, None, err
    max_q, err = parse_test_question_limit(params.get('max_questions'), param_name='max_questions')
    if err:
        return None, None, err
    if min_q is not None and max_q is not None and min_q > max_q:
        return None, None, 'min_questions cannot be greater than max_questions.'
    return min_q, max_q, None


class ExternalTestsListView(APIView):
    """Tashqi servis: e'lon qilingan testlar ro'yxati."""

    authentication_classes = []
    permission_classes = [HasExternalApiKey]

    def get(self, request):
        min_q, max_q, err = _parse_list_question_filters(request.query_params)
        if err:
            return Response({'detail': err}, status=status.HTTP_400_BAD_REQUEST)

        qs = filter_catalog_queryset(
            published_catalog_queryset().filter(kind=PreparedContent.KIND_TEST),
            request.query_params,
        )
        qs = filter_by_stored_question_count(qs, min_questions=min_q, max_questions=max_q)
        response = paginated_response(
            qs,
            request,
            default_page_size=50,
            max_page_size=200,
            mapper=lambda item: catalog_item_summary(item, include_verification=True),
        )
        response.data['question_limit_bounds'] = {
            'min': TEST_QUESTION_LIMIT_MIN,
            'max': TEST_QUESTION_LIMIT_MAX,
        }
        return response


class ExternalTestsDetailView(APIView):
    authentication_classes = []
    permission_classes = [HasExternalApiKey]

    def get(self, request, pk: int):
        raw_limit = request.query_params.get('question_limit') or request.query_params.get('question_count')
        limit, err = parse_test_question_limit(raw_limit)
        if err:
            return Response({'detail': err}, status=status.HTTP_400_BAD_REQUEST)
        lang, err = parse_test_language(
            request.query_params.get('language') or request.query_params.get('lang')
        )
        if err:
            return Response({'detail': err}, status=status.HTTP_400_BAD_REQUEST)

        item = published_catalog_queryset().filter(pk=pk, kind=PreparedContent.KIND_TEST).first()
        if not item:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        payload_raw = item.payload if isinstance(item.payload, dict) else {}
        available_langs = available_test_languages(payload_raw)
        projected, used_lang = project_test_payload_language(payload_raw, lang)
        payload, available, returned = slice_test_payload(projected, limit)

        data = catalog_item_summary(item, include_verification=True)
        data['payload'] = payload
        data['language'] = used_lang
        data['available_languages'] = available_langs
        data['question_count_available'] = available
        data['question_count_returned'] = returned
        data['question_limit_bounds'] = {
            'min': TEST_QUESTION_LIMIT_MIN,
            'max': TEST_QUESTION_LIMIT_MAX,
        }
        if limit is not None:
            data['question_limit'] = limit
        return Response(data)


class ExternalQuestionsSampleView(APIView):
    """
    Kafedra/fan doirasidagi barcha e'lon qilingan testlardan
    unique savollarni aralashtirib, so'ralgan sondagi namunani qaytaradi.
    """

    authentication_classes = []
    permission_classes = [HasExternalApiKey]

    def get(self, request):
        params = request.query_params
        subject_code = (params.get('subject_code') or '').strip()
        department_code = (params.get('department_code') or '').strip()
        if not subject_code and not department_code:
            return Response(
                {'detail': 'subject_code or department_code is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_count = (
            params.get('count')
            or params.get('question_limit')
            or params.get('question_count')
        )
        # count berilmasa — unique poolning hammasi (imtihon 0 = barcha).
        count, err = parse_test_question_limit(raw_count, param_name='count')
        if err:
            return Response({'detail': err}, status=status.HTTP_400_BAD_REQUEST)

        qs = filter_catalog_queryset(
            published_catalog_queryset().filter(kind=PreparedContent.KIND_TEST),
            params,
        )
        questions, available, tests_scanned = collect_unique_questions_from_tests(
            qs,
            shuffle=True,
            count=count,
        )

        return Response(
            {
                'subject_code': subject_code,
                'department_code': department_code,
                'variant_label': (params.get('variant_label') or '').strip(),
                'topic_code': (params.get('topic_code') or '').strip().lower(),
                'syllabus_id': (params.get('syllabus_id') or '').strip(),
                'available_languages': list(SUPPORTED_TEST_LANGUAGES),
                'count_requested': count,
                'count_available': available,
                'count_returned': len(questions),
                'tests_scanned': tests_scanned,
                'question_limit_bounds': {
                    'min': TEST_QUESTION_LIMIT_MIN,
                    'max': TEST_QUESTION_LIMIT_MAX,
                },
                'questions': questions,
            }
        )


class ExternalTestsStatsView(APIView):
    authentication_classes = []
    permission_classes = [HasExternalApiKey]

    def get(self, request):
        body = build_catalog_stats(published_only=True, kind=PreparedContent.KIND_TEST)
        body['question_limit_bounds'] = {
            'min': TEST_QUESTION_LIMIT_MIN,
            'max': TEST_QUESTION_LIMIT_MAX,
        }
        return Response(body)


class ExternalCatalogStatsView(APIView):
    """Kafedra → fan → yo'nalish → mavzu katalog statistikasi."""

    authentication_classes = []
    permission_classes = [HasExternalApiKey]

    def get(self, request):
        from .external_catalog_service import build_external_catalog_stats

        body = build_external_catalog_stats()
        body['question_limit_bounds'] = {
            'min': TEST_QUESTION_LIMIT_MIN,
            'max': TEST_QUESTION_LIMIT_MAX,
        }
        return Response(body)


class ExternalCatalogDepartmentsView(APIView):
    """
    1-qadam: kafedra ro'yxati (code + name + fanlar soni).
    Keyin: GET .../departments/<code>/subjects/ — shu kafedra fanlari.
    """

    authentication_classes = []
    permission_classes = [HasExternalApiKey]

    def get(self, request):
        from .external_catalog_service import external_departments_list

        rows = external_departments_list()
        return Response({
            'count': len(rows),
            'results': rows,
            'next_step': 'GET /v1/external/catalog/departments/<department_code>/subjects/',
        })


class ExternalCatalogDepartmentSubjectsView(APIView):
    """2-qadam: tanlangan kafedra fanlari (subject_code + subject_name)."""

    authentication_classes = []
    permission_classes = [HasExternalApiKey]

    def get(self, request, department_code: str):
        from .external_catalog_service import external_department_subjects_paginated

        payload = external_department_subjects_paginated(department_code, request)
        if payload is None:
            return Response({'detail': 'Department not found.'}, status=status.HTTP_404_NOT_FOUND)
        payload['next_step'] = 'GET /v1/external/catalog/subjects/<subject_code>/'
        return Response(payload)


class ExternalCatalogDepartmentDetailView(APIView):
    """Bitta kafedra + uning fanlari (nomlar bilan)."""

    authentication_classes = []
    permission_classes = [HasExternalApiKey]

    def get(self, request, department_code: str):
        from .external_catalog_service import external_department_detail

        detail = external_department_detail(department_code)
        if not detail:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(detail)


class ExternalCatalogSubjectsView(APIView):
    authentication_classes = []
    permission_classes = [HasExternalApiKey]

    def get(self, request):
        from .external_catalog_service import (
            active_syllabus_queryset,
            external_catalog_subject_summary,
            filter_external_subjects,
        )

        qs = filter_external_subjects(active_syllabus_queryset(), request.query_params)
        rows = []
        for obj in qs:
            summary = external_catalog_subject_summary(obj)
            if summary['topics_count'] > 0:
                rows.append(summary)
        return paginated_response(
            rows,
            request,
            default_page_size=50,
            max_page_size=200,
        )


class ExternalCatalogSubjectDetailView(APIView):
    authentication_classes = []
    permission_classes = [HasExternalApiKey]

    def get(self, request, subject_code: str):
        from .external_catalog_service import (
            active_syllabus_queryset,
            external_catalog_subject_detail,
        )

        code = (subject_code or '').strip()
        obj = active_syllabus_queryset().filter(subject_code=code).first()
        if not obj:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        detail = external_catalog_subject_detail(obj)
        if detail['topics_count'] <= 0:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(detail)
