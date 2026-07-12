"""Tashqi servislar uchun test bazasi API (API kalit bilan)."""

from __future__ import annotations

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from .content_catalog_service import (
    CATALOG_KINDS,
    build_catalog_stats,
    catalog_item_summary,
    filter_catalog_queryset,
    published_catalog_queryset,
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


class ExternalTestsListView(APIView):
    """Tashqi servis: e'lon qilingan testlar ro'yxati."""

    authentication_classes = []
    permission_classes = [HasExternalApiKey]

    def get(self, request):
        qs = filter_catalog_queryset(
            published_catalog_queryset().filter(kind=PreparedContent.KIND_TEST),
            request.query_params,
        )
        return paginated_response(
            qs,
            request,
            default_page_size=50,
            max_page_size=200,
            mapper=lambda item: catalog_item_summary(item, include_verification=True),
        )


class ExternalTestsDetailView(APIView):
    authentication_classes = []
    permission_classes = [HasExternalApiKey]

    def get(self, request, pk: int):
        item = (
            published_catalog_queryset()
            .filter(pk=pk, kind=PreparedContent.KIND_TEST)
            .first()
        )
        if not item:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = catalog_item_summary(item, include_verification=True)
        data['payload'] = item.payload if isinstance(item.payload, dict) else {}
        return Response(data)


class ExternalTestsStatsView(APIView):
    authentication_classes = []
    permission_classes = [HasExternalApiKey]

    def get(self, request):
        return Response(build_catalog_stats(published_only=True, kind=PreparedContent.KIND_TEST))
