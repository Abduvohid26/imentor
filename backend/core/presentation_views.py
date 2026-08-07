"""Mavzu bo‘yicha taqdimot fayllari (PDF / PPT / PPTX) — yuklash va ko‘rish."""

from __future__ import annotations

import logging
import os

from django.conf import settings
from django.db.models import Max
from django.http import FileResponse
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import TopicPresentation
from .permissions import HasEducationRole, resolve_user_role
from .serializers import TopicPresentationSerializer

logger = logging.getLogger(__name__)

_ALLOWED_CONTENT_TYPES = frozenset(
    {
        "application/pdf",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/octet-stream",
    }
)
_ALLOWED_EXTENSIONS = frozenset({".pdf", ".ppt", ".pptx"})


def _norm_topic(topic: str) -> str:
    return (topic or "").strip().lower()


def _detect_kind(name: str, content_type: str) -> str:
    lower = name.lower()
    if lower.endswith(".pdf") or content_type == "application/pdf":
        return TopicPresentation.KIND_PDF
    if lower.endswith(".pptx") or "presentationml" in content_type:
        return TopicPresentation.KIND_PPTX
    return TopicPresentation.KIND_PPT


def _validate_uploaded_file(uploaded) -> None:
    if not uploaded:
        raise serializers.ValidationError({"file": "Fayl tanlanmadi."})
    ext = os.path.splitext(uploaded.name or "")[1].lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise serializers.ValidationError(
            {"file": "Faqat PDF, PPT yoki PPTX yuklash mumkin."}
        )
    ctype = (getattr(uploaded, "content_type", None) or "").split(";")[0].strip().lower()
    if ctype and ctype not in _ALLOWED_CONTENT_TYPES:
        raise serializers.ValidationError({"file": "Ruxsat etilmagan fayl turi."})
    size = int(getattr(uploaded, "size", 0) or 0)
    max_bytes = int(getattr(settings, "PRESENTATION_MAX_BYTES", 50 * 1024 * 1024))
    if size > max_bytes:
        raise serializers.ValidationError(
            {"file": f"Fayl hajmi {max_bytes // (1024 * 1024)} MB dan oshmasligi kerak."}
        )


class TopicPresentationUploadSerializer(serializers.Serializer):
    # max_length validate() da qisqartiriladi — uzun syllabus sarlavhalari 400 bermasin
    topic = serializers.CharField(max_length=4000)
    topic_norm = serializers.CharField(max_length=4000, required=False, allow_blank=True)
    title = serializers.CharField(max_length=4000, required=False, allow_blank=True)
    file = serializers.FileField()

    def validate(self, attrs):
        topic = (attrs.get("topic") or "").strip()
        if len(topic) < 2:
            raise serializers.ValidationError({"topic": "Mavzu nomi juda qisqa."})
        if len(topic) > 255:
            topic = topic[:254].rstrip() + "…"
        topic_norm = (attrs.get("topic_norm") or "").strip() or _norm_topic(topic)
        if not topic_norm:
            raise serializers.ValidationError({"topic_norm": "Mavzu normallashtirilmadi."})
        if len(topic_norm) > 255:
            topic_norm = topic_norm[:255]
        title = (attrs.get("title") or "").strip()
        if len(title) > 255:
            title = title[:254].rstrip() + "…"
        attrs["topic"] = topic
        attrs["topic_norm"] = topic_norm
        if title:
            attrs["title"] = title
        _validate_uploaded_file(attrs.get("file"))
        return attrs


class TopicPresentationListCreateView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(responses=TopicPresentationSerializer(many=True))
    def get(self, request):
        norms: list[str] = []
        single = _norm_topic(request.query_params.get("topic_norm", ""))
        if single:
            norms.append(single)
        for raw in request.query_params.getlist("topic_norm"):
            n = _norm_topic(raw)
            if n and n not in norms:
                norms.append(n)
        syllabus_raw = (request.query_params.get("syllabus_id") or "").strip()
        variant_label = (request.query_params.get("variant_label") or "").strip()
        topic_code = (request.query_params.get("topic_code") or "").strip()
        if syllabus_raw and variant_label and topic_code:
            built = f"{syllabus_raw}::{variant_label.strip().lower()}::{topic_code.strip().lower()}"
            if built not in norms:
                norms.append(built)
        if not norms:
            return Response({"detail": "topic_norm parametri kerak."}, status=400)
        qs = TopicPresentation.objects.filter(topic_norm__in=norms).order_by("sort_order", "id")
        ser = TopicPresentationSerializer(qs, many=True, context={"request": request})
        return Response(ser.data)

    @extend_schema(request=TopicPresentationUploadSerializer, responses=TopicPresentationSerializer)
    def post(self, request):
        ser = TopicPresentationUploadSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        uploaded = data["file"]
        topic_norm = data["topic_norm"]
        owner = request.user.username
        display = (
            f"{request.user.first_name} {request.user.last_name}".strip()
            or request.user.username
        )
        max_order = (
            TopicPresentation.objects.filter(topic_norm=topic_norm).aggregate(m=Max("sort_order"))["m"]
            or 0
        )
        obj = TopicPresentation.objects.create(
            owner_key=owner,
            author_name=display[:255],
            topic=data["topic"],
            topic_norm=topic_norm,
            title=(data.get("title") or uploaded.name or "")[:255],
            kind=_detect_kind(uploaded.name or "", getattr(uploaded, "content_type", "") or ""),
            file=uploaded,
            file_name=(uploaded.name or "file")[:512],
            file_size=int(uploaded.size or 0),
            sort_order=int(max_order) + 1,
        )
        return Response(
            TopicPresentationSerializer(obj, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class TopicPresentationFileView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]

    def get(self, request, pk: int):
        obj = TopicPresentation.objects.filter(pk=pk).first()
        if not obj or not obj.file:
            return Response({"detail": "Topilmadi."}, status=404)
        try:
            f = obj.file.open("rb")
        except OSError:
            return Response({"detail": "Fayl diskda topilmadi."}, status=404)
        ctype = "application/pdf"
        name = obj.file_name or obj.file.name
        lower = name.lower()
        if lower.endswith(".pptx"):
            ctype = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        elif lower.endswith(".ppt"):
            ctype = "application/vnd.ms-powerpoint"
        return FileResponse(f, as_attachment=False, filename=name, content_type=ctype)


class TopicPresentationPreviewView(APIView):
    """PPTX/PPT → PDF (LibreOffice), brauzer iframe uchun."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]

    def get(self, request, pk: int):
        from pathlib import Path

        from django.conf import settings

        from .pptx_preview import ensure_presentation_preview_pdf

        obj = TopicPresentation.objects.filter(pk=pk).first()
        if not obj or not obj.file:
            return Response({"detail": "Topilmadi."}, status=404)
        try:
            abs_path = Path(obj.file.path)
        except Exception:
            abs_path = Path(settings.MEDIA_ROOT) / str(obj.file)
        try:
            pdf_path = ensure_presentation_preview_pdf(abs_path)
        except FileNotFoundError:
            return Response({"detail": "Fayl diskda topilmadi."}, status=404)
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        except RuntimeError as e:
            return Response({"detail": str(e)}, status=503)
        except Exception:
            return Response(
                {"detail": "Taqdimot preview tayyorlanmadi. Yuklab olib PowerPoint da oching."},
                status=503,
            )
        preview_name = (obj.file_name or "presentation").rsplit(".", 1)[0] + ".pdf"
        return FileResponse(
            open(pdf_path, "rb"),
            as_attachment=False,
            filename=preview_name,
            content_type="application/pdf",
        )


class TopicPresentationDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]

    def delete(self, request, pk: int):
        obj = TopicPresentation.objects.filter(pk=pk).first()
        if not obj:
            return Response({"detail": "Topilmadi."}, status=404)
        role = resolve_user_role(request.user, request)
        if obj.owner_key != request.user.username and role != "admin":
            return Response({"detail": "Faqat yuklagan o‘qituvchi yoki admin o‘chira oladi."}, status=403)
        try:
            obj.file.delete(save=False)
        except Exception:
            logger.warning("Failed to delete presentation file for pk=%s", obj.pk, exc_info=True)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
