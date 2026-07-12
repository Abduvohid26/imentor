from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .content_catalog_service import (
    CATALOG_KINDS,
    build_catalog_stats,
    catalog_item_summary,
    catalog_subjects_summary,
    filter_catalog_queryset,
    published_catalog_queryset,
)
from .models import PreparedContent
from .pagination import paginated_response
from .permissions import HasEducationRole, IsAdminRole


class ContentCatalogListView(APIView):
    """Keys va testlar bazasi — faqat 1 soatdan eski materiallar."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]

    def get(self, request):
        qs = filter_catalog_queryset(published_catalog_queryset(), request.query_params)
        return paginated_response(
            qs,
            request,
            default_page_size=50,
            max_page_size=200,
            mapper=catalog_item_summary,
        )


class ContentCatalogDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]

    def get(self, request, pk: int):
        item = published_catalog_queryset().filter(pk=pk).first()
        if not item:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = catalog_item_summary(item)
        data['payload'] = item.payload if isinstance(item.payload, dict) else {}
        return Response(data)


class ContentCatalogSubjectsView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]

    def get(self, request):
        return Response(catalog_subjects_summary())


class AdminContentCatalogListView(APIView):
    """Admin: barcha keys/testlar — 1 soatlik e'lon kechikishisiz, to'liq nazorat uchun."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        qs = filter_catalog_queryset(
            PreparedContent.objects.filter(kind__in=CATALOG_KINDS), request.query_params
        )
        return paginated_response(
            qs,
            request,
            default_page_size=50,
            max_page_size=200,
            mapper=catalog_item_summary,
        )


class AdminContentCatalogDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request, pk: int):
        item = PreparedContent.objects.filter(pk=pk, kind__in=CATALOG_KINDS).first()
        if not item:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = catalog_item_summary(item)
        data['payload'] = item.payload if isinstance(item.payload, dict) else {}
        return Response(data)

    def delete(self, request, pk: int):
        deleted, _ = PreparedContent.objects.filter(pk=pk, kind__in=CATALOG_KINDS).delete()
        if not deleted:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminContentCatalogStatsView(APIView):
    """Admin: test/keys bazasi statistikasi — fan, yo'nalish, mavzu, muallif."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        kind = (request.query_params.get('kind') or '').strip()
        if kind and kind not in CATALOG_KINDS:
            return Response({'detail': 'kind must be case or test.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(build_catalog_stats(published_only=False, kind=kind or None))


class PublicContentCatalogStatsView(APIView):
    """Ochiq statistika — faqat e'lon qilingan (1 soatdan eski) materiallar."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        kind = (request.query_params.get('kind') or '').strip()
        if kind and kind not in CATALOG_KINDS:
            return Response({'detail': 'kind must be case or test.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(build_catalog_stats(published_only=True, kind=kind or None))


class PublicContentCatalogListView(APIView):
    """Ochiq keys/test bazasi — ro'yxatdan o'tmasdan ko'rish (faqat e'lon qilingan)."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        qs = filter_catalog_queryset(published_catalog_queryset(), request.query_params)
        return paginated_response(
            qs,
            request,
            default_page_size=50,
            max_page_size=200,
            mapper=lambda item: catalog_item_summary(item, include_verification=True),
        )


class PublicContentCatalogDetailView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, pk: int):
        item = published_catalog_queryset().filter(pk=pk).first()
        if not item:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = catalog_item_summary(item, include_verification=True)
        data['payload'] = item.payload if isinstance(item.payload, dict) else {}
        data['view_only'] = True
        return Response(data)


class PublicContentCatalogSubjectsView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(catalog_subjects_summary())
