"""Tashqi servislar uchun test bazasi API (API kalit bilan)."""

from __future__ import annotations

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from .content_catalog_service import (
    TEST_QUESTION_LIMIT_MAX,
    TEST_QUESTION_LIMIT_MIN,
    build_catalog_stats,
    catalog_item_summary,
    filter_by_stored_question_count,
    filter_catalog_queryset,
    parse_test_question_limit,
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

        item = (
            published_catalog_queryset()
            .filter(pk=pk, kind=PreparedContent.KIND_TEST)
            .first()
        )
        if not item:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        payload_raw = item.payload if isinstance(item.payload, dict) else {}
        payload, available, returned = slice_test_payload(payload_raw, limit)

        data = catalog_item_summary(item, include_verification=True)
        data['payload'] = payload
        data['question_count_available'] = available
        data['question_count_returned'] = returned
        data['question_limit_bounds'] = {
            'min': TEST_QUESTION_LIMIT_MIN,
            'max': TEST_QUESTION_LIMIT_MAX,
        }
        if limit is not None:
            data['question_limit'] = limit
        return Response(data)


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
