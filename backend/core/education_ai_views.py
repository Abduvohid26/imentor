"""Authenticated education AI proxy — OpenAI kaliti faqat serverda (Celery orqali)."""

from __future__ import annotations

from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .ai_async import dispatch_ai_job
from .education_ai_utils import clip_education_messages
from .openai_client import OPENAI_CHAT
from .permissions import HasEducationRole
from .tasks import run_education_ai_completion
from .throttling import EducationAiUserThrottle


class EducationAiCompletionSerializer(serializers.Serializer):
    model = serializers.CharField(required=False, default=OPENAI_CHAT)
    messages = serializers.ListField(child=serializers.JSONField(), allow_empty=False)
    max_tokens = serializers.IntegerField(required=False, default=4096, min_value=256, max_value=16384)
    temperature = serializers.FloatField(required=False, default=0.35, min_value=0.0, max_value=1.5)


class EducationAiCompletionResponseSerializer(serializers.Serializer):
    content = serializers.CharField()


class EducationAiCompletionView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]
    throttle_classes = [EducationAiUserThrottle]

    @extend_schema(
        request=EducationAiCompletionSerializer,
        responses=EducationAiCompletionResponseSerializer,
    )
    def post(self, request):
        serializer = EducationAiCompletionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        api_key = getattr(settings, "OPENAI_API_KEY", "") or ""
        if not api_key.strip():
            return Response(
                {"detail": "OpenAI API kaliti serverda sozlanmagan."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        messages = clip_education_messages(data["messages"])
        if not messages:
            return Response({"detail": "Xabarlar bo‘sh."}, status=status.HTTP_400_BAD_REQUEST)

        payload = {
            "model": data.get("model") or OPENAI_CHAT,
            "messages": messages,
            "max_tokens": int(data.get("max_tokens") or 4096),
            "temperature": float(data.get("temperature") if data.get("temperature") is not None else 0.35),
        }
        return dispatch_ai_job(
            user_id=request.user.pk,
            kind="education_completion",
            payload=payload,
            task=run_education_ai_completion,
        )
