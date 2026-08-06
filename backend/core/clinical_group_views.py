"""Klinika guruhi — admin va klinika administratori API."""

from __future__ import annotations

import re

from django.contrib.auth.models import User
from django.db.models import Count, Q, Sum
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .clinical_group_service import (
    MEMBER_APP_ROLES,
    can_provision_role,
    clinic_for_klinika_admin,
    deactivate_clinic_member,
    member_belongs_to_clinic,
    upsert_clinic_member,
)
from .models import ClinicalGroup, ClinicalGroupMember, ClinicalGroupPayment
from .pagination import paginated_response
from .permissions import IsAdminRole, IsKlinikaAdminRole, resolve_user_role
from .staff_profile_views import delete_staff_profile_for_owner
from .views import _demo_admin_phone_allowlist, _set_user_role_group


def _normalize_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) != 12 or not digits.startswith("998"):
        raise serializers.ValidationError("Telefon 998XXXXXXXXX formatida bo‘lishi kerak.")
    return digits


def _slugify_code(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.strip().lower())
    base = base.strip("-")[:48] or "klinika"
    code = base
    n = 1
    while ClinicalGroup.objects.filter(code=code).exists():
        n += 1
        code = f"{base}-{n}"
    return code


class ClinicalGroupSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    admin_count = serializers.SerializerMethodField()

    class Meta:
        model = ClinicalGroup
        fields = [
            "id",
            "name",
            "code",
            "address",
            "phone",
            "contact_person",
            "subscription_plan",
            "subscription_status",
            "subscription_until",
            "notes",
            "is_active",
            "member_count",
            "admin_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ("id", "created_at", "updated_at", "member_count", "admin_count")

    def get_member_count(self, obj: ClinicalGroup) -> int:
        return getattr(obj, "_member_count", None) or obj.members.filter(is_active=True).count()

    def get_admin_count(self, obj: ClinicalGroup) -> int:
        return getattr(obj, "_admin_count", None) or obj.members.filter(
            is_active=True, is_clinic_admin=True
        ).count()

    def create(self, validated_data):
        if not validated_data.get("code"):
            validated_data["code"] = _slugify_code(validated_data["name"])
        return super().create(validated_data)


class ClinicalGroupMemberSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    phone_display = serializers.SerializerMethodField()

    class Meta:
        model = ClinicalGroupMember
        fields = [
            "id",
            "clinic",
            "owner_key",
            "app_role",
            "is_clinic_admin",
            "first_name",
            "last_name",
            "display_name",
            "phone_display",
            "faculty",
            "department",
            "direction",
            "job_title",
            "study_group",
            "participant_kind",
            "is_active",
            "joined_at",
            "updated_at",
        ]
        read_only_fields = ("id", "clinic", "joined_at", "updated_at", "display_name", "phone_display")

    def get_display_name(self, obj: ClinicalGroupMember) -> str:
        name = f"{obj.first_name} {obj.last_name}".strip()
        return name or obj.owner_key

    def get_phone_display(self, obj: ClinicalGroupMember) -> str:
        d = obj.owner_key
        if len(d) == 12:
            return f"+{d}"
        return d


class ClinicalGroupMemberWriteSerializer(serializers.Serializer):
    phone_digits = serializers.CharField(max_length=20)
    password = serializers.CharField(min_length=6, max_length=128)
    app_role = serializers.ChoiceField(choices=MEMBER_APP_ROLES, default="hodim")
    first_name = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    last_name = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    faculty = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    department = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    direction = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    job_title = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    study_group = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    participant_kind = serializers.CharField(max_length=16, required=False, allow_blank=True, default="")

    def validate_phone_digits(self, value: str) -> str:
        return _normalize_phone(value)

    def validate_app_role(self, value: str) -> str:
        role = (value or "hodim").strip().lower()
        if role == "klinika_admin":
            raise serializers.ValidationError("Klinika adminini faqat tizim administratori tayinlaydi.")
        if role not in MEMBER_APP_ROLES:
            return "hodim"
        return role


class ClinicalGroupMemberPatchSerializer(serializers.Serializer):
    app_role = serializers.ChoiceField(choices=("hodim",), required=False)
    first_name = serializers.CharField(max_length=128, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=128, required=False, allow_blank=True)
    faculty = serializers.CharField(max_length=255, required=False, allow_blank=True)
    department = serializers.CharField(max_length=255, required=False, allow_blank=True)
    direction = serializers.CharField(max_length=255, required=False, allow_blank=True)
    job_title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    study_group = serializers.CharField(max_length=128, required=False, allow_blank=True)
    participant_kind = serializers.CharField(max_length=16, required=False, allow_blank=True)
    password = serializers.CharField(min_length=6, max_length=128, required=False)
    is_active = serializers.BooleanField(required=False)


class ClinicalGroupPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClinicalGroupPayment
        fields = [
            "id",
            "clinic",
            "amount_uzs",
            "period_label",
            "period_start",
            "period_end",
            "status",
            "paid_at",
            "payment_method",
            "reference",
            "notes",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ("id", "clinic", "created_by", "created_at", "updated_at")


class AssignClinicAdminSerializer(serializers.Serializer):
    phone_digits = serializers.CharField(max_length=20)
    password = serializers.CharField(min_length=6, max_length=128)
    first_name = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    last_name = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")

    def validate_phone_digits(self, value: str) -> str:
        return _normalize_phone(value)


def _provision_user_account(
    phone_digits: str,
    password: str,
    role: str,
    first_name: str = "",
    last_name: str = "",
) -> tuple[User, bool]:
    defaults = {
        "first_name": (first_name or "").strip(),
        "last_name": (last_name or "").strip(),
    }
    user, created = User.objects.get_or_create(username=phone_digits, defaults=defaults)
    user.set_password(password)
    if not created:
        user.first_name = defaults["first_name"] or user.first_name
        user.last_name = defaults["last_name"] or user.last_name
    user.save(update_fields=["password", "first_name", "last_name"])
    if role == "admin" and phone_digits not in _demo_admin_phone_allowlist():
        role = "hodim"
    _set_user_role_group(user, role)
    return user, created


class AdminClinicalGroupListCreateView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    @extend_schema(responses={200: ClinicalGroupSerializer(many=True)})
    def get(self, request):
        qs = (
            ClinicalGroup.objects.annotate(
                _member_count=Count("members", filter=Q(members__is_active=True)),
                _admin_count=Count(
                    "members",
                    filter=Q(members__is_active=True, members__is_clinic_admin=True),
                ),
            )
            .order_by("name")
        )
        return paginated_response(
            qs,
            request,
            default_page_size=30,
            max_page_size=100,
            mapper=lambda obj: ClinicalGroupSerializer(obj).data,
        )

    @extend_schema(request=ClinicalGroupSerializer, responses={201: ClinicalGroupSerializer})
    def post(self, request):
        serializer = ClinicalGroupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save()
        return Response(ClinicalGroupSerializer(obj).data, status=status.HTTP_201_CREATED)


class AdminClinicalGroupDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    def _get(self, pk: int) -> ClinicalGroup | None:
        return ClinicalGroup.objects.filter(pk=pk).first()

    @extend_schema(responses={200: ClinicalGroupSerializer})
    def get(self, request, pk: int):
        obj = self._get(pk)
        if not obj:
            return Response({"detail": "Topilmadi."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ClinicalGroupSerializer(obj).data)

    @extend_schema(request=ClinicalGroupSerializer, responses={200: ClinicalGroupSerializer})
    def patch(self, request, pk: int):
        obj = self._get(pk)
        if not obj:
            return Response({"detail": "Topilmadi."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ClinicalGroupSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk: int):
        obj = self._get(pk)
        if not obj:
            return Response(status=status.HTTP_404_NOT_FOUND)
        obj.is_active = False
        obj.save(update_fields=["is_active", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminClinicalGroupAssignAdminView(APIView):
    """Tizim admini: klinika uchun administrator tayinlash."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    @extend_schema(request=AssignClinicAdminSerializer)
    def post(self, request, pk: int):
        clinic = ClinicalGroup.objects.filter(pk=pk, is_active=True).first()
        if not clinic:
            return Response({"detail": "Klinika topilmadi."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AssignClinicAdminSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        phone = data["phone_digits"]
        user, created = _provision_user_account(
            phone,
            data["password"],
            "klinika_admin",
            data.get("first_name", ""),
            data.get("last_name", ""),
        )
        member = upsert_clinic_member(
            clinic,
            phone,
            app_role="klinika_admin",
            is_clinic_admin=True,
            first_name=data.get("first_name", "") or user.first_name,
            last_name=data.get("last_name", "") or user.last_name,
        )
        return Response(
            {
                "username": phone,
                "role": "klinika_admin",
                "clinic_id": clinic.id,
                "member_id": member.id,
                "created": created,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class AdminClinicalGroupMembersView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    @extend_schema(responses={200: ClinicalGroupMemberSerializer(many=True)})
    def get(self, request, pk: int):
        clinic = ClinicalGroup.objects.filter(pk=pk).first()
        if not clinic:
            return Response({"detail": "Topilmadi."}, status=status.HTTP_404_NOT_FOUND)
        rows = clinic.members.order_by("-is_clinic_admin", "last_name", "first_name")
        return paginated_response(
            rows,
            request,
            default_page_size=50,
            max_page_size=200,
            mapper=lambda member: ClinicalGroupMemberSerializer(member).data,
        )


class ClinicAdminDashboardView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsKlinikaAdminRole]

    def get(self, request):
        clinic = clinic_for_klinika_admin(request.user, request)
        if not clinic:
            return Response(
                {"detail": "Klinika administratori klinikaga bog‘lanmagan."},
                status=status.HTTP_403_FORBIDDEN,
            )
        members = clinic.members.filter(is_active=True)
        payments = clinic.payments.all()
        paid_total = payments.filter(status=ClinicalGroupPayment.STATUS_PAID).aggregate(
            s=Sum("amount_uzs")
        )["s"] or 0
        pending_total = payments.filter(
            status__in=(
                ClinicalGroupPayment.STATUS_PENDING,
                ClinicalGroupPayment.STATUS_OVERDUE,
            )
        ).aggregate(s=Sum("amount_uzs"))["s"] or 0
        return Response(
            {
                "clinic": ClinicalGroupSerializer(clinic).data,
                "stats": {
                    "members_total": members.count(),
                    "members_hodim": members.filter(app_role="hodim").count(),
                    "payments_paid_total_uzs": str(paid_total),
                    "payments_pending_total_uzs": str(pending_total),
                    "payments_overdue_count": payments.filter(
                        status=ClinicalGroupPayment.STATUS_OVERDUE
                    ).count(),
                },
            }
        )


class ClinicAdminMemberListCreateView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsKlinikaAdminRole]

    def _clinic(self, request) -> ClinicalGroup | None:
        return clinic_for_klinika_admin(request.user, request)

    @extend_schema(responses={200: ClinicalGroupMemberSerializer(many=True)})
    def get(self, request):
        clinic = self._clinic(request)
        if not clinic:
            return Response({"detail": "Klinika topilmadi."}, status=status.HTTP_403_FORBIDDEN)
        rows = clinic.members.filter(is_active=True).order_by("last_name", "first_name")
        return paginated_response(
            rows,
            request,
            default_page_size=50,
            max_page_size=200,
            mapper=lambda member: ClinicalGroupMemberSerializer(member).data,
        )

    @extend_schema(request=ClinicalGroupMemberWriteSerializer, responses={201: ClinicalGroupMemberSerializer})
    def post(self, request):
        clinic = self._clinic(request)
        if not clinic:
            return Response({"detail": "Klinika topilmadi."}, status=status.HTTP_403_FORBIDDEN)
        serializer = ClinicalGroupMemberWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        role = data["app_role"]
        actor = resolve_user_role(request.user, request)
        if not can_provision_role(actor, role):
            return Response({"detail": "Bu rolni tayinlash huquqi yo‘q."}, status=status.HTTP_403_FORBIDDEN)
        phone = data["phone_digits"]
        user, _ = _provision_user_account(
            phone,
            data["password"],
            role,
            data.get("first_name", ""),
            data.get("last_name", ""),
        )
        member = upsert_clinic_member(
            clinic,
            phone,
            app_role=role,
            is_clinic_admin=False,
            first_name=data.get("first_name", "") or user.first_name,
            last_name=data.get("last_name", "") or user.last_name,
            faculty=data.get("faculty", ""),
            department=data.get("department", ""),
            direction=data.get("direction", ""),
            job_title=data.get("job_title", ""),
            study_group=data.get("study_group", ""),
            participant_kind=data.get("participant_kind", ""),
        )
        return Response(ClinicalGroupMemberSerializer(member).data, status=status.HTTP_201_CREATED)


class ClinicAdminMemberDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsKlinikaAdminRole]

    def _member(self, request, member_id: int) -> ClinicalGroupMember | None:
        clinic = clinic_for_klinika_admin(request.user, request)
        if not clinic:
            return None
        return ClinicalGroupMember.objects.filter(pk=member_id, clinic=clinic).first()

    @extend_schema(request=ClinicalGroupMemberPatchSerializer, responses={200: ClinicalGroupMemberSerializer})
    def patch(self, request, member_id: int):
        member = self._member(request, member_id)
        if not member:
            return Response({"detail": "Topilmadi."}, status=status.HTTP_404_NOT_FOUND)
        if member.is_clinic_admin:
            return Response(
                {"detail": "Klinika administratorini faqat tizim admini o‘zgartiradi."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ClinicalGroupMemberPatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "app_role" in data:
            actor = resolve_user_role(request.user, request)
            if not can_provision_role(actor, data["app_role"]):
                return Response({"detail": "Bu rolni tayinlash huquqi yo‘q."}, status=status.HTTP_403_FORBIDDEN)
            member.app_role = data["app_role"]
            user = User.objects.filter(username=member.owner_key).first()
            if user:
                _set_user_role_group(user, data["app_role"])
        for field in (
            "first_name",
            "last_name",
            "faculty",
            "department",
            "direction",
            "job_title",
            "study_group",
            "participant_kind",
            "is_active",
        ):
            if field in data:
                setattr(member, field, data[field])
        member.save()
        if data.get("password"):
            user = User.objects.filter(username=member.owner_key).first()
            if user:
                user.set_password(data["password"])
                user.save(update_fields=["password"])
        return Response(ClinicalGroupMemberSerializer(member).data)

    def delete(self, request, member_id: int):
        member = self._member(request, member_id)
        if not member:
            return Response({"detail": "Topilmadi."}, status=status.HTTP_404_NOT_FOUND)
        if member.is_clinic_admin:
            return Response(
                {"detail": "Klinika administratorini o‘chirib bo‘lmaydi."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if request.user.username == member.owner_key:
            return Response({"detail": "O‘zingizni o‘chira olmaysiz."}, status=status.HTTP_400_BAD_REQUEST)
        clinic = member.clinic
        deactivate_clinic_member(clinic, member.owner_key)
        user = User.objects.filter(username=member.owner_key).first()
        if user and not user.is_superuser:
            delete_staff_profile_for_owner(member.owner_key)
            user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ClinicAdminPaymentListCreateView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsKlinikaAdminRole]

    def _clinic(self, request) -> ClinicalGroup | None:
        return clinic_for_klinika_admin(request.user, request)

    @extend_schema(responses={200: ClinicalGroupPaymentSerializer(many=True)})
    def get(self, request):
        clinic = self._clinic(request)
        if not clinic:
            return Response({"detail": "Klinika topilmadi."}, status=status.HTTP_403_FORBIDDEN)
        rows = clinic.payments.order_by("-period_start", "-created_at")
        return paginated_response(
            rows,
            request,
            default_page_size=30,
            max_page_size=100,
            mapper=lambda payment: ClinicalGroupPaymentSerializer(payment).data,
        )

    @extend_schema(request=ClinicalGroupPaymentSerializer, responses={201: ClinicalGroupPaymentSerializer})
    def post(self, request):
        clinic = self._clinic(request)
        if not clinic:
            return Response({"detail": "Klinika topilmadi."}, status=status.HTTP_403_FORBIDDEN)
        serializer = ClinicalGroupPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save(clinic=clinic, created_by=request.user.username)
        return Response(ClinicalGroupPaymentSerializer(obj).data, status=status.HTTP_201_CREATED)


class ClinicAdminPaymentDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsKlinikaAdminRole]

    def _payment(self, request, payment_id: int) -> ClinicalGroupPayment | None:
        clinic = clinic_for_klinika_admin(request.user, request)
        if not clinic:
            return None
        return ClinicalGroupPayment.objects.filter(pk=payment_id, clinic=clinic).first()

    @extend_schema(request=ClinicalGroupPaymentSerializer, responses={200: ClinicalGroupPaymentSerializer})
    def patch(self, request, payment_id: int):
        obj = self._payment(request, payment_id)
        if not obj:
            return Response({"detail": "Topilmadi."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ClinicalGroupPaymentSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save()
        if obj.status == ClinicalGroupPayment.STATUS_PAID and not obj.paid_at:
            obj.paid_at = timezone.now()
            obj.save(update_fields=["paid_at", "updated_at"])
        return Response(ClinicalGroupPaymentSerializer(obj).data)

    def delete(self, request, payment_id: int):
        obj = self._payment(request, payment_id)
        if not obj:
            return Response({"detail": "Topilmadi."}, status=status.HTTP_404_NOT_FOUND)
        if obj.status == ClinicalGroupPayment.STATUS_PAID:
            return Response(
                {"detail": "To‘langan yozuvni o‘chirib bo‘lmaydi."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
