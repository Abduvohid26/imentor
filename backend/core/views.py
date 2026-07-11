import os
import re
import secrets

from django.conf import settings
from django.contrib.auth.models import Group, User, update_last_login
from django.db import IntegrityError, transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.views import APIView

from .permissions import (
    ALLOWED_ROLES,
    HasEducationRole,
    IsAdminRole,
    IsHodimRole,
    IsStartuperOrAdmin,
    resolve_user_role,
)
from .models import (
    CampusBuilding,
    CourseSyllabus,
    LiveTestDraft,
    LiveTestSession,
    LiveTestSubmission,
    PreparedContent,
    StaffLocationAlert,
    StaffLocationPing,
    StaffProfile,
    StaffScheduleSlot,
    StartupProjectApplication,
    SyllabusDocument,
)
from .location_service import record_ping_and_evaluate
from .live_test_service import finalize_live_test_session, strip_questions_for_student
from .pagination import paginated_response
from .throttling import LiveTestAnonThrottle, LoginRateThrottle, StaffPingRateThrottle
from .staff_profile_views import delete_staff_profile_for_owner, staff_photo_url_for_user
from .week_schedule import current_week_phase_code, iso_week_number, week_phase_label_uz
from .serializers import (
    AdminDeprovisionStaffSerializer,
    AdminStaffUpsertSerializer,
    CampusBuildingSerializer,
    ChangePasswordSerializer,
    LocalLoginSerializer,
    LiveTestSubmissionCreateSerializer,
    LiveTestDraftUpsertSerializer,
    LiveTestUpsertSerializer,
    PreparedContentSerializer,
    StaffLocationAlertSerializer,
    StaffLocationPingCreateSerializer,
    StaffLocationPingSerializer,
    StaffScheduleBulkSerializer,
    StaffScheduleSlotSerializer,
    StartupProjectApplicationSerializer,
    SyllabusDocumentSerializer,
    SyllabusUpsertSerializer,
)


class HealthResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    time = serializers.DateTimeField()


class AuthMeResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    role = serializers.CharField(allow_null=True)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    photo_url = serializers.CharField(required=False, allow_blank=True)
    clinic_id = serializers.IntegerField(required=False, allow_null=True)
    clinic_name = serializers.CharField(required=False, allow_blank=True)
    clinic_code = serializers.CharField(required=False, allow_blank=True)


class LocalLoginResponseSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()
    role = serializers.CharField()
    username = serializers.CharField()
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    photo_url = serializers.CharField(required=False, allow_blank=True)
    clinic_id = serializers.IntegerField(required=False, allow_null=True)
    clinic_name = serializers.CharField(required=False, allow_blank=True)
    clinic_code = serializers.CharField(required=False, allow_blank=True)


class PreparedContentEmptyResponseSerializer(serializers.Serializer):
    payload = serializers.JSONField(allow_null=True)


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(responses=HealthResponseSerializer)
    def get(self, request):
        return Response({'status': 'ok', 'time': timezone.now()})


class PreparedContentView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(responses={200: PreparedContentSerializer})
    def get(self, request):
        if not settings.ALLOW_LEGACY_PREPARED_CONTENT_API:
            return Response(
                {"detail": "Legacy prepared-content API is disabled. Use /api/v1/prepared-content/."},
                status=status.HTTP_403_FORBIDDEN,
            )
        owner_key = request.query_params.get('owner_key', '').strip()
        kind = request.query_params.get('kind', '').strip()
        topic_norm = request.query_params.get('topic_norm', '').strip()
        if not owner_key or not kind or not topic_norm:
            return Response(
                {'detail': 'owner_key, kind, topic_norm are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item = (
            PreparedContent.objects.filter(
                owner_key=owner_key,
                kind=kind,
                topic_norm=topic_norm,
            )
            .order_by('-created_at')
            .first()
        )
        if not item:
            return Response({"payload": None}, status=status.HTTP_200_OK)
        return Response(PreparedContentSerializer(item).data)

    @extend_schema(request=PreparedContentSerializer, responses={201: PreparedContentSerializer})
    def post(self, request):
        if not settings.ALLOW_LEGACY_PREPARED_CONTENT_API:
            return Response(
                {"detail": "Legacy prepared-content API is disabled. Use /api/v1/prepared-content/."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = PreparedContentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = serializer.save()
        return Response(PreparedContentSerializer(item).data, status=status.HTTP_201_CREATED)


class PreparedContentV1DetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]

    def delete(self, request, pk: int):
        item = PreparedContent.objects.filter(pk=pk, owner_key=request.user.username).first()
        if not item:
            return Response({"detail": "Topilmadi."}, status=status.HTTP_404_NOT_FOUND)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PreparedContentV1View(PreparedContentView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]

    @extend_schema(responses={200: PreparedContentSerializer})
    def get(self, request):
        kind = request.query_params.get('kind', '').strip()
        topic_norm = request.query_params.get('topic_norm', '').strip()
        if not kind or not topic_norm:
            return Response(
                {'detail': 'kind, topic_norm are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        item = (
            PreparedContent.objects.filter(
                owner_key=request.user.username,
                kind=kind,
                topic_norm=topic_norm,
            )
            .order_by('-created_at')
            .first()
        )
        if not item:
            return Response({"payload": None}, status=status.HTTP_200_OK)
        return Response(PreparedContentSerializer(item).data)

    @extend_schema(request=PreparedContentSerializer, responses={201: PreparedContentSerializer})
    def post(self, request):
        payload = dict(request.data)
        payload["owner_key"] = request.user.username
        serializer = PreparedContentSerializer(data=payload)
        serializer.is_valid(raise_exception=True)

        # Fanga qat'iy bog'lash: subject_code -> CourseSyllabus (topilsa FK + kanonik nom)
        subject_code = (serializer.validated_data.get("subject_code") or "").strip()
        syllabus = (
            CourseSyllabus.objects.filter(subject_code=subject_code).first()
            if subject_code
            else None
        )
        if syllabus:
            item = serializer.save(syllabus=syllabus, subject_name=syllabus.subject_name)
        else:
            item = serializer.save()
        return Response(PreparedContentSerializer(item).data, status=status.HTTP_201_CREATED)


class AuthMeView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]

    @extend_schema(responses=AuthMeResponseSerializer)
    def get(self, request):
        role = resolve_user_role(request.user, request)
        return Response(
            {
                "id": request.user.id,
                "username": request.user.username,
                "role": role,
                "first_name": request.user.first_name or "",
                "last_name": request.user.last_name or "",
                "photo_url": staff_photo_url_for_user(request, request.user.username),
            }
        )


def _demo_admin_phone_allowlist() -> frozenset[str]:
    raw = os.environ.get("DEMO_ADMIN_PHONES", "998901110001")
    return frozenset(
        re.sub(r"\D", "", part)
        for part in raw.split(",")
        if part.strip()
    )


def _ensure_admin_group(user: User) -> None:
    group, _ = Group.objects.get_or_create(name="admin")
    user.groups.add(group)


def _set_user_role_group(user: User, role: str) -> None:
    """Login paytida bitta ta'lim roli — JWT va Group sinxron."""
    role = (role or "").strip().lower()
    if role not in ALLOWED_ROLES:
        return
    for name in ALLOWED_ROLES:
        group = Group.objects.filter(name=name).first()
        if group is not None:
            user.groups.remove(group)
    group, _ = Group.objects.get_or_create(name=role)
    user.groups.add(group)


def _resolve_login_role(user: User, requested_role: str) -> str:
    requested = (requested_role or "hodim").strip().lower()
    if user.is_superuser:
        return "admin"
    if requested == "admin" and user.username in _demo_admin_phone_allowlist():
        _ensure_admin_group(user)
        return "admin"
    if requested == "admin":
        db_role = resolve_user_role(user, request=None)
        return db_role or "hodim"
    if requested in ("hodim", "startuper"):
        _set_user_role_group(user, requested)
        return requested
    db_role = resolve_user_role(user, request=None)
    return db_role or "hodim"


def _login_response_payload(user: User, role: str, request=None) -> dict:
    refresh = RefreshToken.for_user(user)
    refresh["role"] = role
    access = refresh.access_token
    access["role"] = role
    return {
        "access": str(access),
        "refresh": str(refresh),
        "role": role,
        "username": user.username,
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
        "photo_url": staff_photo_url_for_user(request, user.username),
    }


class LocalLoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    @extend_schema(request=LocalLoginSerializer, responses=LocalLoginResponseSerializer)
    def post(self, request):
        serializer = LocalLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        username = data["phone_digits"]
        password = data["password"]
        is_register = bool(data.get("register"))
        requested_role = (data.get("role") or "").strip().lower()

        defaults = {
            "first_name": (data.get("first_name") or "").strip(),
            "last_name": (data.get("last_name") or "").strip(),
        }

        user = User.objects.filter(username=username).first()
        if user is None:
            if not is_register:
                return Response(
                    {"detail": "Telefon yoki parol noto‘g‘ri."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            if not getattr(settings, "ALLOW_OPEN_REGISTRATION", True):
                return Response(
                    {"detail": "Ro‘yxatdan o‘tish faqat administrator orqali mumkin."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            reg_role = requested_role or "hodim"
            if reg_role not in ("hodim", "startuper"):
                reg_role = "hodim"
            user = User.objects.create_user(
                username=username,
                password=password,
                first_name=defaults["first_name"],
                last_name=defaults["last_name"],
            )
            group, _ = Group.objects.get_or_create(name=reg_role)
            user.groups.add(group)
            role = reg_role
        else:
            if not user.check_password(password):
                return Response(
                    {"detail": "Telefon yoki parol noto‘g‘ri."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            if is_register:
                return Response(
                    {"detail": "Bu telefon raqam allaqachon ro‘yxatdan o‘tgan."},
                    status=status.HTTP_409_CONFLICT,
                )
            role = resolve_user_role(user, request=None) or "hodim"

        update_last_login(None, user)
        return Response(_login_response_payload(user, role, request))


class AdminProvisionStaffView(APIView):
    """Administrator yangi xodimni server bazasiga qo‘shadi yoki mavjudini tahrirlaydi."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    @extend_schema(request=AdminStaffUpsertSerializer)
    def post(self, request):
        serializer = AdminStaffUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        username = data["phone_digits"]
        password = (data.get("password") or "").strip()
        role = (data.get("role") or "hodim").strip().lower()
        if role not in ALLOWED_ROLES:
            role = "hodim"

        defaults = {
            "first_name": (data.get("first_name") or "").strip(),
            "last_name": (data.get("last_name") or "").strip(),
        }
        user, created = User.objects.get_or_create(username=username, defaults=defaults)
        if created and not password:
            return Response(
                {"detail": "Yangi xodim uchun parol majburiy."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        update_fields = ["first_name", "last_name"]
        if password:
            user.set_password(password)
            update_fields.append("password")
        if not created:
            user.first_name = defaults["first_name"] or user.first_name
            user.last_name = defaults["last_name"] or user.last_name
        user.save(update_fields=update_fields)

        if role == "admin" and username not in _demo_admin_phone_allowlist():
            role = "hodim"
        _set_user_role_group(user, role)

        profile_fields = {
            k: (data.get(k) or "").strip()
            for k in ("faculty", "department", "direction", "participant_kind", "study_group", "job_title")
            if k in data
        }
        if profile_fields:
            profile, _ = StaffProfile.objects.get_or_create(owner_key=username)
            for field, value in profile_fields.items():
                setattr(profile, field, value)
            profile.save(update_fields=list(profile_fields.keys()) + ["updated_at"])

        return Response(
            {
                "username": username,
                "role": role,
                "created": created,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ChangePasswordView(APIView):
    """Foydalanuvchi o‘z parolini yangilaydi."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]

    @extend_schema(request=ChangePasswordSerializer)
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = request.user
        if not user.check_password(data["current_password"]):
            return Response(
                {"detail": "Joriy parol noto‘g‘ri."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(data["new_password"])
        user.save(update_fields=["password"])
        return Response({"ok": True})


class AdminDeprovisionStaffView(APIView):
    """Administrator serverdagi xodim hisobini o‘chiradi."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    @extend_schema(request=AdminDeprovisionStaffSerializer)
    def post(self, request):
        serializer = AdminDeprovisionStaffSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data["phone_digits"]
        if request.user.username == username:
            return Response(
                {"detail": "O‘zingizni o‘chira olmaysiz."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = User.objects.filter(username=username).first()
        if not user:
            return Response(status=status.HTTP_204_NO_CONTENT)
        if user.is_superuser:
            return Response(
                {"detail": "Superuser o‘chirib bo‘lmaydi."},
                status=status.HTTP_403_FORBIDDEN,
            )
        delete_staff_profile_for_owner(username)
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SyllabusDocumentListCreateView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]

    @extend_schema(responses={200: SyllabusDocumentSerializer(many=True)})
    def get(self, request):
        qs = SyllabusDocument.objects.filter(owner_key=request.user.username)
        return Response(SyllabusDocumentSerializer(qs, many=True).data)

    @extend_schema(request=SyllabusUpsertSerializer, responses={201: SyllabusDocumentSerializer})
    def post(self, request):
        serializer = SyllabusUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        obj, _created = SyllabusDocument.objects.update_or_create(
            owner_key=request.user.username,
            external_id=data['external_id'],
            defaults={
                'file_name': data['file_name'],
                'topics': data['topics'],
            },
        )
        return Response(SyllabusDocumentSerializer(obj).data, status=status.HTTP_201_CREATED)


class SyllabusDocumentDestroyView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]

    def delete(self, request, pk: int):
        try:
            obj = SyllabusDocument.objects.get(pk=pk, owner_key=request.user.username)
        except SyllabusDocument.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class LiveTestUpsertView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]

    def post(self, request):
        serializer = LiveTestUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        key = (d.get('session_key') or '').strip()
        if not key:
            for _ in range(5):
                key = f"lts_{secrets.token_urlsafe(16)}"
                if not LiveTestSession.objects.filter(session_key=key).exists():
                    break
            else:
                return Response(
                    {'detail': 'Could not allocate session key.'},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
        owner = request.user.username

        existing = LiveTestSession.objects.filter(session_key=key).first()
        if existing and existing.owner_key != owner:
            return Response({'detail': 'Session key already in use.'}, status=status.HTTP_409_CONFLICT)

        created_ms = d.get('created_at_ms')
        if created_ms is None:
            created_ms = int(timezone.now().timestamp() * 1000)

        payload = {
            'topic': (d['topic'] or '').strip(),
            'questions': d['questions'],
            'createdAt': created_ms,
        }
        defaults = {'owner_key': owner, 'payload': payload}
        if existing is None:
            defaults['is_closed'] = False
            defaults['closed_at'] = None
        LiveTestSession.objects.update_or_create(
            session_key=key,
            defaults=defaults,
        )
        return Response({'ok': True, 'session_key': key}, status=status.HTTP_200_OK)


def _live_test_submissions_payload(session: LiveTestSession) -> list[dict]:
    return [
        {
            'first_name': s.first_name,
            'last_name': s.last_name,
            'answers': s.answers,
            'submitted_at': s.submitted_at.isoformat(),
        }
        for s in session.submissions.all()
    ]


class LiveTestPublicRetrieveView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LiveTestAnonThrottle]

    def get(self, request, session_key: str):
        obj = LiveTestSession.objects.filter(session_key=session_key.strip()).first()
        if not obj:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        p = obj.payload if isinstance(obj.payload, dict) else {}
        created_ms = p.get('createdAt')
        if created_ms is None:
            created_ms = int(obj.created_at.timestamp() * 1000)
        raw_questions = p.get('questions', [])
        questions = (
            strip_questions_for_student(raw_questions)
            if isinstance(raw_questions, list)
            else []
        )
        return Response(
            {
                'topic': p.get('topic', ''),
                'questions': questions,
                'created_at_ms': created_ms,
                'is_closed': bool(obj.is_closed),
            }
        )


class LiveTestSubmissionView(APIView):
    """
    GET: teacher JWT — list submissions for own session.
    POST: anonymous — student submits answers (QR flow).
    """

    def get_authenticators(self):
        req = getattr(self, 'request', None)
        if req is not None and req.method == 'POST':
            return []
        return [JWTAuthentication()]

    def get_permissions(self):
        if getattr(self, 'request') and self.request.method == 'POST':
            return [AllowAny()]
        return [IsAuthenticated(), HasEducationRole()]

    def get_throttles(self):
        if getattr(self, 'request') and self.request.method == 'POST':
            return [LiveTestAnonThrottle()]
        return []

    def get(self, request, session_key: str):
        obj = LiveTestSession.objects.filter(
            session_key=session_key.strip(),
            owner_key=request.user.username,
        ).first()
        if not obj:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = _live_test_submissions_payload(obj)
        return Response(data)

    def post(self, request, session_key: str):
        obj = LiveTestSession.objects.filter(session_key=session_key.strip()).first()
        if not obj:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if obj.is_closed:
            return Response({'detail': 'Test sessiyasi yakunlangan.'}, status=status.HTTP_403_FORBIDDEN)
        serializer = LiveTestSubmissionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        participant_key = (d.get('participant_key') or '').strip()
        if participant_key and obj.submissions.filter(participant_key=participant_key).exists():
            return Response({'ok': True, 'already_submitted': True}, status=status.HTTP_200_OK)
        try:
            LiveTestSubmission.objects.create(
                session=obj,
                participant_key=participant_key,
                first_name=d['first_name'].strip(),
                last_name=d['last_name'].strip(),
                answers=list(d['answers']),
            )
        except IntegrityError:
            return Response({'ok': True, 'already_submitted': True}, status=status.HTTP_200_OK)
        if participant_key:
            obj.drafts.filter(participant_key=participant_key).delete()
        return Response({'ok': True}, status=status.HTTP_201_CREATED)


class LiveTestDraftUpsertView(APIView):
    """Talaba: QR test ochganda draft javoblarni saqlaydi (yuborishdan oldin)."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LiveTestAnonThrottle]

    def post(self, request, session_key: str):
        obj = LiveTestSession.objects.filter(session_key=session_key.strip()).first()
        if not obj:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if obj.is_closed:
            return Response({'detail': 'Test sessiyasi yakunlangan.'}, status=status.HTTP_403_FORBIDDEN)
        serializer = LiveTestDraftUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        participant_key = d['participant_key'].strip()
        if not participant_key:
            return Response({'detail': 'participant_key required.'}, status=status.HTTP_400_BAD_REQUEST)
        if obj.submissions.filter(participant_key=participant_key).exists():
            return Response({'ok': True, 'already_submitted': True}, status=status.HTTP_200_OK)
        LiveTestDraft.objects.update_or_create(
            session=obj,
            participant_key=participant_key,
            defaults={
                'first_name': (d.get('first_name') or '').strip(),
                'last_name': (d.get('last_name') or '').strip(),
                'answers': list(d.get('answers') or []),
            },
        )
        return Response({'ok': True}, status=status.HTTP_200_OK)


class LiveTestFinalizeView(APIView):
    """O'qituvchi: draftlarni avtomatik topshirish va sessiyani yopish."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]

    def post(self, request, session_key: str):
        obj = LiveTestSession.objects.filter(
            session_key=session_key.strip(),
            owner_key=request.user.username,
        ).first()
        if not obj:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        auto_count = finalize_live_test_session(obj)
        obj.refresh_from_db()
        return Response(
            {
                'ok': True,
                'is_closed': obj.is_closed,
                'auto_submitted': auto_count,
                'submissions': _live_test_submissions_payload(obj),
            },
            status=status.HTTP_200_OK,
        )


class StartupApplicationListCreateView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsStartuperOrAdmin]

    def get(self, request):
        qs = StartupProjectApplication.objects.filter(owner_key=request.user.username).order_by('-updated_at')
        return paginated_response(
            qs,
            request,
            default_page_size=30,
            max_page_size=100,
            mapper=lambda obj: StartupProjectApplicationSerializer(obj).data,
        )

    def post(self, request):
        serializer = StartupProjectApplicationSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class StartupApplicationDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsStartuperOrAdmin]

    def _get(self, request, pk: int, user):
        obj = StartupProjectApplication.objects.filter(pk=pk).first()
        if not obj:
            return None
        role = resolve_user_role(user, request)
        if role == 'admin' or obj.owner_key == user.username:
            return obj
        return None

    def get(self, request, pk: int):
        obj = self._get(request, pk, request.user)
        if not obj:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(StartupProjectApplicationSerializer(obj).data)

    def patch(self, request, pk: int):
        obj = self._get(request, pk, request.user)
        if not obj:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = StartupProjectApplicationSerializer(
            obj,
            data=request.data,
            partial=True,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(StartupProjectApplicationSerializer(obj).data)

    def delete(self, request, pk: int):
        obj = self._get(request, pk, request.user)
        if not obj:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if obj.status == StartupProjectApplication.STATUS_SUBMITTED and resolve_user_role(request.user, request) != 'admin':
            return Response({'detail': 'Yuborilgan arizani o‘chirib bo‘lmaydi.'}, status=status.HTTP_400_BAD_REQUEST)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class StartupApplicationSubmitView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsStartuperOrAdmin]

    def post(self, request, pk: int):
        obj = StartupProjectApplication.objects.filter(pk=pk, owner_key=request.user.username).first()
        if not obj:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if obj.status == StartupProjectApplication.STATUS_SUBMITTED:
            return Response({'detail': 'Allaqachon yuborilgan.'}, status=status.HTTP_400_BAD_REQUEST)
        obj.status = StartupProjectApplication.STATUS_SUBMITTED
        obj.submitted_at = timezone.now()
        obj.save(update_fields=['status', 'submitted_at', 'updated_at'])
        return Response(StartupProjectApplicationSerializer(obj).data)


class StartupApplicationAdminInboxView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        qs = StartupProjectApplication.objects.filter(
            status=StartupProjectApplication.STATUS_SUBMITTED,
        ).order_by('-submitted_at')
        return paginated_response(
            qs,
            request,
            default_page_size=30,
            max_page_size=100,
            mapper=lambda obj: StartupProjectApplicationSerializer(obj).data,
        )


class StaffLocationPingView(APIView):
    """
    Hodim: GPS nuqtasini yuborish. Server jadval bo'yicha radius tekshiradi.
    """

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsHodimRole]
    throttle_classes = [StaffPingRateThrottle]

    def post(self, request):
        serializer = StaffLocationPingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        client_kind = (d.get("client_kind") or "").strip().lower()
        if client_kind and client_kind != "mobile":
            return Response(
                {"detail": "Joylashuv faqat telefon (mobil) qurilmadan qabul qilinadi."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            _ping, alerts = record_ping_and_evaluate(
                request.user.username,
                d['latitude'],
                d['longitude'],
                d.get('accuracy_m'),
                d.get('client_ts_ms'),
            )
        except ValueError:
            return Response(
                {"detail": "Koordinata noto‘g‘ri."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if _ping is None:
            return Response(
                {
                    "ok": True,
                    "skipped": True,
                    "reason": "accuracy_too_low",
                    "alerts_created": 0,
                    "alert_ids": [],
                },
                status=status.HTTP_201_CREATED,
            )
        return Response(
            {
                'ok': True,
                'alerts_created': len(alerts),
                'alert_ids': [a.id for a in alerts],
            },
            status=status.HTTP_201_CREATED,
        )


class StaffScheduleSelfView(APIView):
    """Hodim: o'z dars jadvali (kutilgan binolar va vaqt)."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsHodimRole]

    def get(self, request):
        qs = (
            StaffScheduleSlot.objects.filter(
                owner_key=request.user.username,
                is_active=True,
            )
            .select_related('building')
            .order_by('week_phase', 'weekday', 'start_time')
        )
        return Response(StaffScheduleSlotSerializer(qs, many=True).data)


class ScheduleWeekInfoView(APIView):
    """
    Joriy ISO hafta va yuqori/pastki (toq/juft) — brauzer va server bir xil hisoblaydi.
    """

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]

    def get(self, request):
        now = timezone.localtime()
        wn = iso_week_number(now)
        ph = current_week_phase_code(now)
        return Response(
            {
                'iso_week': wn,
                'current_week_phase': ph,
                'current_week_phase_label_uz': week_phase_label_uz(ph),
            }
        )


class StaffCampusBuildingListView(APIView):
    """Barcha tizim rollari: faol bino ro'yxati (jadvalda tanlash uchun)."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, HasEducationRole]

    def get(self, request):
        qs = CampusBuilding.objects.filter(is_active=True).order_by('sort_order', 'name')
        return Response(CampusBuildingSerializer(qs, many=True).data)


class AdminCampusBuildingListCreateView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        qs = CampusBuilding.objects.all().order_by('sort_order', 'name')
        return Response(CampusBuildingSerializer(qs, many=True).data)

    def post(self, request):
        serializer = CampusBuildingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class AdminCampusBuildingDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    def patch(self, request, pk: int):
        obj = CampusBuilding.objects.filter(pk=pk).first()
        if not obj:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = CampusBuildingSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk: int):
        obj = CampusBuilding.objects.filter(pk=pk).first()
        if not obj:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if StaffScheduleSlot.objects.filter(building=obj).exists():
            return Response(
                {'detail': 'Bu binoga boglangan jadval slotlari bor — avval ularni o‘zgartiring.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminStaffScheduleBulkView(APIView):
    """Bir o‘qituvchi uchun bitta `week_phase` bo‘yicha jadvalni to‘liq almashtirish."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request):
        serializer = StaffScheduleBulkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        owner = d['owner_key']
        phase = d['week_phase']
        replace = d['replace_existing']
        rows = d['slots']
        with transaction.atomic():
            if replace:
                StaffScheduleSlot.objects.filter(owner_key=owner, week_phase=phase).delete()
            to_create = []
            for x in rows:
                if x.get('building_id') is not None:
                    b = CampusBuilding.objects.get(pk=x['building_id'], is_active=True)
                    to_create.append(
                        StaffScheduleSlot(
                            owner_key=owner,
                            week_phase=phase,
                            weekday=x['weekday'],
                            start_time=x['start_time'],
                            end_time=x['end_time'],
                            building=b,
                            building_name=b.name,
                            latitude=b.latitude,
                            longitude=b.longitude,
                            radius_m=b.radius_m,
                            title=(x.get('title') or '').strip(),
                            is_active=True,
                        )
                    )
                else:
                    to_create.append(
                        StaffScheduleSlot(
                            owner_key=owner,
                            week_phase=phase,
                            weekday=x['weekday'],
                            start_time=x['start_time'],
                            end_time=x['end_time'],
                            building=None,
                            building_name=(x.get('building_name') or '').strip(),
                            latitude=x['latitude'],
                            longitude=x['longitude'],
                            radius_m=x['radius_m'],
                            title=(x.get('title') or '').strip(),
                            is_active=True,
                        )
                    )
            if to_create:
                StaffScheduleSlot.objects.bulk_create(to_create)
        return Response(
            {
                'ok': True,
                'created_count': len(rows),
                'owner_key': owner,
                'week_phase': phase,
            },
            status=status.HTTP_201_CREATED,
        )


class AdminStaffScheduleListCreateView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        owner = request.query_params.get('owner_key', '').strip()
        qs = StaffScheduleSlot.objects.all().select_related('building').order_by(
            'owner_key', 'week_phase', 'weekday', 'start_time'
        )
        if owner:
            qs = qs.filter(owner_key=owner)
        return Response(StaffScheduleSlotSerializer(qs, many=True).data)

    def post(self, request):
        serializer = StaffScheduleSlotSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class AdminStaffScheduleDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    def patch(self, request, pk: int):
        obj = StaffScheduleSlot.objects.filter(pk=pk).first()
        if not obj:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = StaffScheduleSlotSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk: int):
        obj = StaffScheduleSlot.objects.filter(pk=pk).first()
        if not obj:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminStaffLocationPingsView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        from datetime import timedelta

        from .location_policy import LIVE_PING_MAX_AGE_HOURS

        owner = request.query_params.get('owner_key', '').strip()
        mode = (request.query_params.get('mode') or '').strip().lower()
        qs = StaffLocationPing.objects.all().order_by('-recorded_at')
        if owner:
            qs = qs.filter(owner_key=owner)

        if mode == 'live':
            since = timezone.now() - timedelta(hours=LIVE_PING_MAX_AGE_HOURS)
            qs = qs.filter(recorded_at__gte=since)
            latest: dict[str, StaffLocationPing] = {}
            for ping in qs.iterator(chunk_size=500):
                if ping.owner_key not in latest:
                    latest[ping.owner_key] = ping
            rows = sorted(latest.values(), key=lambda p: p.owner_key)
            return Response(StaffLocationPingSerializer(rows, many=True).data)

        return paginated_response(
            qs,
            request,
            default_page_size=100,
            max_page_size=500,
            mapper=lambda ping: StaffLocationPingSerializer(ping).data,
        )


class AdminStaffLocationAlertsView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        owner = request.query_params.get('owner_key', '').strip()
        qs = StaffLocationAlert.objects.all().order_by('-created_at')
        if owner:
            qs = qs.filter(owner_key=owner)
        return paginated_response(
            qs,
            request,
            default_page_size=50,
            max_page_size=200,
            mapper=lambda alert: StaffLocationAlertSerializer(alert).data,
        )
