"""Admin: import qilingan fan darsliklarini (SubjectBook) ko'rish va boshqarish."""

from __future__ import annotations

import logging

from django.db.models import Count
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import AcademicDepartment, SubjectBook
from .pagination import paginated_response
from .permissions import IsAdminRole
from .serializers import SubjectBookSerializer

logger = logging.getLogger(__name__)


class AdminSubjectBookStatsView(APIView):
    """Kafedra bo'yicha kitob/chunk sonlari — 'Kitoblar' sahifasi uchun umumiy ko'rinish."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        depts = (
            AcademicDepartment.objects.annotate(
                books_count=Count("books", distinct=True),
                chunks_count=Count("books__chunks", distinct=True),
            )
            .filter(books_count__gt=0)
            .order_by("name")
        )
        by_department = [
            {
                "id": d.id,
                "code": d.code,
                "name": d.name,
                "books_count": d.books_count,
                "chunks_count": d.chunks_count,
            }
            for d in depts
        ]
        return Response(
            {
                "departments_count": len(by_department),
                "books_count": SubjectBook.objects.count(),
                "by_department": by_department,
            }
        )


class AdminSubjectBookListView(APIView):
    """GET: barcha import qilingan darsliklar (kafedra bo'yicha filtrlash mumkin)."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    @extend_schema(responses=SubjectBookSerializer(many=True))
    def get(self, request):
        qs = (
            SubjectBook.objects.select_related("department")
            .annotate(chunk_count=Count("chunks", distinct=True))
            .order_by("department__name", "title")
        )
        department_code = (request.query_params.get("department_code") or "").strip()
        if department_code:
            qs = qs.filter(department__code=department_code)
        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(title__icontains=q)
        return paginated_response(
            qs,
            request,
            default_page_size=100,
            max_page_size=300,
            mapper=lambda obj: SubjectBookSerializer(obj, context={"request": request}).data,
        )


class AdminSubjectBookDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    def delete(self, request, pk: int):
        obj = SubjectBook.objects.filter(pk=pk).first()
        if not obj:
            return Response({"detail": "Topilmadi."}, status=404)
        try:
            obj.file.delete(save=False)
        except Exception:
            logger.warning("Failed to delete subject book file for pk=%s", obj.pk, exc_info=True)
        obj.delete()
        return Response(status=204)
