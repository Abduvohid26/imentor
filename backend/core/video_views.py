"""Mavzuga biriktirilgan YouTube videolar: admin qo'shadi, o'qituvchi ko'radi."""

from __future__ import annotations

import re

from django.db.models import Max
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .handout_views import _build_topic_norm, _canonical_topic_norm, _topic_norm_query
from .models import TopicVideo
from .pagination import paginated_response
from .permissions import HasEducationRole, IsAdminRole

_YT_RE = re.compile(
    r"(?:youtube\.com/(?:watch\?(?:[^&]*&)*v=|embed/|shorts/|v/|live/)|youtu\.be/)"
    r"([A-Za-z0-9_-]{11})"
)


def extract_youtube_id(url: str) -> str:
    """YouTube URL (turli ko'rinish) yoki toza ID dan 11-belgili video ID."""
    if not url:
        return ""
    m = _YT_RE.search(url)
    if m:
        return m.group(1)
    s = url.strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", s):
        return s
    return ""


class TopicVideoSerializer(serializers.ModelSerializer):
    embed_url = serializers.SerializerMethodField()

    class Meta:
        model = TopicVideo
        fields = [
            "id",
            "topic",
            "topic_norm",
            "title",
            "youtube_id",
            "youtube_url",
            "embed_url",
            "author_name",
            "created_at",
        ]

    def get_embed_url(self, obj) -> str:
        return f"https://www.youtube.com/embed/{obj.youtube_id}"


class TopicVideoCreateSerializer(serializers.Serializer):
    syllabus_id = serializers.IntegerField(min_value=1)
    variant_label = serializers.CharField(max_length=128)
    topic_code = serializers.CharField(max_length=32)
    topic = serializers.CharField(max_length=255)
    title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    youtube_url = serializers.CharField(max_length=512)


def _norms_from_params(params) -> list[str]:
    norms: list[str] = []
    syllabus_raw = (params.get("syllabus_id") or "").strip()
    variant_label = (params.get("variant_label") or "").strip()
    topic_code = (params.get("topic_code") or "").strip()
    if syllabus_raw and variant_label and topic_code:
        try:
            built = _build_topic_norm(int(syllabus_raw), variant_label, topic_code)
        except (TypeError, ValueError):
            built = ""
        if built:
            norms.append(built)
    norms.extend(n.strip() for n in params.getlist("topic_norm") if n.strip())
    return norms


class TopicVideoListView(APIView):
    """O'qituvchi: mavzu bo'yicha videolarni ko'rish (embed uchun)."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]

    @extend_schema(responses=TopicVideoSerializer(many=True))
    def get(self, request):
        norms = _norms_from_params(request.query_params)
        if not norms:
            return Response({"detail": "topic_norm parametri kerak."}, status=400)
        query = _topic_norm_query(norms)
        if query is None:
            return Response([], status=status.HTTP_200_OK)
        qs = TopicVideo.objects.filter(query).distinct()
        return Response(TopicVideoSerializer(qs, many=True).data)


class AdminTopicVideoListCreateView(APIView):
    """Admin: barcha videolarni ko'rish va yangi video qo'shish."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    @extend_schema(responses=TopicVideoSerializer(many=True))
    def get(self, request):
        qs = TopicVideo.objects.all().order_by("-created_at")
        norms = _norms_from_params(request.query_params)
        if norms:
            query = _topic_norm_query(norms)
            qs = qs.filter(query) if query is not None else qs.none()
        return paginated_response(
            qs,
            request,
            default_page_size=100,
            max_page_size=500,
            mapper=lambda obj: TopicVideoSerializer(obj).data,
        )

    @extend_schema(request=TopicVideoCreateSerializer, responses=TopicVideoSerializer)
    def post(self, request):
        ser = TopicVideoCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        topic = (data["topic"] or "").strip()
        topic_norm = _build_topic_norm(data["syllabus_id"], data["variant_label"], data["topic_code"])
        if not topic_norm:
            topic_norm = _canonical_topic_norm("", topic)
        if not topic_norm:
            return Response({"detail": "Mavzu normallashtirilmadi."}, status=400)

        youtube_id = extract_youtube_id(data["youtube_url"])
        if not youtube_id:
            return Response({"detail": "Yaroqli YouTube havolasi kiriting."}, status=400)

        display = (
            f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        )
        max_order = (
            TopicVideo.objects.filter(topic_norm=topic_norm).aggregate(m=Max("sort_order"))["m"] or 0
        )
        obj = TopicVideo.objects.create(
            owner_key=request.user.username,
            author_name=display[:255],
            topic=topic,
            topic_norm=topic_norm,
            title=(data.get("title") or "").strip()[:255],
            youtube_url=(data["youtube_url"] or "").strip()[:512],
            youtube_id=youtube_id,
            sort_order=int(max_order) + 1,
        )
        return Response(TopicVideoSerializer(obj).data, status=status.HTTP_201_CREATED)


class AdminTopicVideoDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    def delete(self, request, pk: int):
        obj = TopicVideo.objects.filter(pk=pk).first()
        if not obj:
            return Response({"detail": "Topilmadi."}, status=404)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
