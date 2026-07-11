"""QR juftlash: kompyuter sessiyasi telefon login orqali tasdiqlanadi."""

from __future__ import annotations

import secrets
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import RefreshToken

from .models import DevicePairingSession
from .permissions import IsHodimRole, resolve_user_role
from .staff_profile_views import staff_photo_url_for_user

PAIRING_TTL_MINUTES = 4

_SENSITIVE_PROFILE_KEYS = frozenset(
    {
        "password",
        "phoneDigits",
        "phone_digits",
        "access",
        "refresh",
        "token",
    }
)


def _sanitize_profile_snapshot(profile: dict) -> dict:
    """JWT yetarli — parol, token va katta base64 rasmlarni kompyuterga yubormaymiz."""
    safe: dict = {}
    for key, value in profile.items():
        if key in _SENSITIVE_PROFILE_KEYS:
            continue
        if key == "photoURL" and isinstance(value, str):
            trimmed = value.strip()
            if trimmed.startswith("data:") or len(trimmed) > 512:
                continue
        if isinstance(value, str) and len(value) > 4000:
            safe[key] = value[:4000]
        else:
            safe[key] = value
    return safe


def _profile_snapshot_for_pairing(request, profile: dict) -> dict:
    """Serverdagi avatar URL — bitta manba, qurilmalar o‘rtasida sinxron."""
    safe = _sanitize_profile_snapshot(profile if isinstance(profile, dict) else {})
    server_photo = staff_photo_url_for_user(request, request.user.username)
    if server_photo:
        safe["photoURL"] = server_photo
    else:
        safe.pop("photoURL", None)
    return safe


def _expire_stale() -> None:
    now = timezone.now()
    DevicePairingSession.objects.filter(
        status=DevicePairingSession.STATUS_PENDING,
        expires_at__lt=now,
    ).update(status=DevicePairingSession.STATUS_EXPIRED)


class DevicePairCreateSerializer(serializers.Serializer):
    pass


class DevicePairCreateResponseSerializer(serializers.Serializer):
    pairing_token = serializers.CharField()
    desktop_secret = serializers.CharField()
    expires_at = serializers.DateTimeField()
    qr_payload = serializers.CharField()


class DevicePairConfirmSerializer(serializers.Serializer):
    pairing_token = serializers.CharField(max_length=64)
    profile = serializers.JSONField(required=False)


class DevicePairStatusResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    expires_at = serializers.DateTimeField(required=False)
    access = serializers.CharField(required=False, allow_blank=True)
    refresh = serializers.CharField(required=False, allow_blank=True)
    role = serializers.CharField(required=False, allow_blank=True)
    username = serializers.CharField(required=False, allow_blank=True)
    profile = serializers.JSONField(required=False)


class DevicePairCreateView(APIView):
    """Kompyuter: yangi QR sessiya."""

    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(responses=DevicePairCreateResponseSerializer)
    def post(self, request):
        _expire_stale()
        token = secrets.token_urlsafe(24)
        desktop_secret = secrets.token_urlsafe(32)
        expires = timezone.now() + timedelta(minutes=PAIRING_TTL_MINUTES)
        DevicePairingSession.objects.create(
            pairing_token=token,
            desktop_secret=desktop_secret,
            status=DevicePairingSession.STATUS_PENDING,
            expires_at=expires,
        )
        qr_payload = f"imentor-pair:{token}"
        return Response(
            {
                "pairing_token": token,
                "desktop_secret": desktop_secret,
                "expires_at": expires,
                "qr_payload": qr_payload,
            },
            status=status.HTTP_201_CREATED,
        )


class DevicePairStatusView(APIView):
    """Kompyuter: polling — tasdiqlanganda JWT + profil (bir marta)."""

    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(responses=DevicePairStatusResponseSerializer)
    def get(self, request, pairing_token: str):
        _expire_stale()
        token = (pairing_token or "").strip()
        if not token:
            return Response({"detail": "Token kerak."}, status=400)
        obj = DevicePairingSession.objects.filter(pairing_token=token).first()
        if not obj:
            return Response({"detail": "Topilmadi."}, status=404)
        secret = (request.query_params.get("secret") or request.headers.get("X-Desktop-Secret") or "").strip()
        stored_secret = (obj.desktop_secret or "").strip()
        if stored_secret:
            if not secret:
                return Response({"detail": "Desktop secret talab qilinadi."}, status=403)
            if not secrets.compare_digest(stored_secret, secret):
                return Response({"detail": "Desktop secret noto‘g‘ri."}, status=403)
        now = timezone.now()
        if obj.status == DevicePairingSession.STATUS_PENDING and obj.expires_at < now:
            obj.status = DevicePairingSession.STATUS_EXPIRED
            obj.save(update_fields=["status"])
        if obj.status == DevicePairingSession.STATUS_CONFIRMED:
            payload = {
                "status": "confirmed",
                "expires_at": obj.expires_at,
                "access": obj.access_token,
                "refresh": obj.refresh_token,
                "role": obj.role,
                "username": obj.owner_key,
                "profile": obj.profile_snapshot,
            }
            obj.status = DevicePairingSession.STATUS_PICKED_UP
            obj.picked_up_at = now
            obj.access_token = ""
            obj.refresh_token = ""
            obj.profile_snapshot = {}
            obj.desktop_secret = ""
            obj.save(
                update_fields=[
                    "status",
                    "picked_up_at",
                    "access_token",
                    "refresh_token",
                    "profile_snapshot",
                    "desktop_secret",
                ]
            )
            return Response(payload)
        return Response(
            {
                "status": obj.status,
                "expires_at": obj.expires_at,
            }
        )


class DevicePairConfirmView(APIView):
    """Telefon (hodim JWT): QR skan qilinganda sessiyani bog'lash."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsHodimRole]

    @extend_schema(request=DevicePairConfirmSerializer, responses=DevicePairStatusResponseSerializer)
    def post(self, request):
        _expire_stale()
        serializer = DevicePairConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data["pairing_token"].strip()
        profile = serializer.validated_data.get("profile")
        if not isinstance(profile, dict):
            profile = {}

        with transaction.atomic():
            obj = (
                DevicePairingSession.objects.select_for_update()
                .filter(pairing_token=token)
                .first()
            )
            if not obj:
                return Response({"detail": "QR kod eskirgan yoki noto'g'ri."}, status=404)
            now = timezone.now()
            if obj.expires_at < now or obj.status != DevicePairingSession.STATUS_PENDING:
                return Response(
                    {"detail": "QR kod muddati tugagan. Kompyuterda yangilang."},
                    status=400,
                )

            role = resolve_user_role(request.user, request) or "hodim"
            refresh = RefreshToken.for_user(request.user)
            refresh["role"] = role
            access = refresh.access_token
            access["role"] = role

            obj.status = DevicePairingSession.STATUS_CONFIRMED
            obj.owner_key = request.user.username
            obj.role = role
            obj.profile_snapshot = _profile_snapshot_for_pairing(request, profile)
            obj.access_token = str(access)
            obj.refresh_token = str(refresh)
            obj.confirmed_at = now
            obj.save()

        return Response({"status": "confirmed", "ok": True})
