from django.contrib import admin
from django.contrib.auth.admin import GroupAdmin as DjangoGroupAdmin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.models import Group, User
from django.utils.translation import gettext_lazy as _

from .forms import PhoneAdminLoginForm
from .models import (
    AcademicDepartment,
    CampusBuilding,
    ClinicalGroup,
    ClinicalGroupMember,
    ClinicalGroupPayment,
    CourseSyllabus,
    DevicePairingSession,
    LiveTestDraft,
    LiveTestSession,
    LiveTestSubmission,
    PreparedContent,
    StaffCourseSelection,
    StaffLocationAlert,
    StaffLocationPing,
    StaffProfile,
    StaffScheduleSlot,
    StartupProjectApplication,
    SyllabusDocument,
    TopicHandout,
    TopicPresentation,
)

admin.site.site_header = "iMentor — boshqaruv paneli"
admin.site.site_title = "iMentor admin"
admin.site.index_title = "Boshqaruv paneli"
admin.site.login_form = PhoneAdminLoginForm


class ReadOnlyTimestampAdmin(admin.ModelAdmin):
    readonly_fields = ("created_at", "updated_at", "recorded_at", "submitted_at", "selected_at")


@admin.register(AcademicDepartment)
class AcademicDepartmentAdmin(ReadOnlyTimestampAdmin):
    list_display = ("id", "name", "code", "sort_order", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "code")
    readonly_fields = ("created_at", "updated_at")


@admin.register(CourseSyllabus)
class CourseSyllabusAdmin(ReadOnlyTimestampAdmin):
    list_display = ("id", "subject_name", "department", "subject_code", "sort_order", "is_active", "created_at")
    list_filter = ("is_active", "department", "instruction_language")
    search_fields = ("subject_name", "subject_code", "department__name")
    readonly_fields = ("created_at", "updated_at")
    autocomplete_fields = ("department",)


@admin.register(PreparedContent)
class PreparedContentAdmin(ReadOnlyTimestampAdmin):
    list_display = (
        "id",
        "kind",
        "subject_name",
        "variant_label",
        "topic_code",
        "topic",
        "author_display_name",
        "owner_key",
        "created_at",
    )
    list_filter = ("kind", "subject_code", "variant_label")
    search_fields = ("owner_key", "topic", "topic_norm", "subject_name", "author_display_name")
    readonly_fields = ("created_at",)


@admin.register(SyllabusDocument)
class SyllabusDocumentAdmin(ReadOnlyTimestampAdmin):
    list_display = ("id", "owner_key", "file_name", "external_id", "created_at")
    search_fields = ("owner_key", "file_name", "external_id")
    readonly_fields = ("created_at",)


@admin.register(StaffCourseSelection)
class StaffCourseSelectionAdmin(ReadOnlyTimestampAdmin):
    list_display = ("owner_key", "syllabus", "selected_at")
    search_fields = ("owner_key", "syllabus__subject_name", "syllabus__subject_code")
    list_filter = ("syllabus",)
    readonly_fields = ("selected_at",)


@admin.register(LiveTestSession)
class LiveTestSessionAdmin(ReadOnlyTimestampAdmin):
    list_display = ("id", "session_key", "owner_key", "created_at")
    search_fields = ("session_key", "owner_key")
    readonly_fields = ("created_at",)


@admin.register(LiveTestSubmission)
class LiveTestSubmissionAdmin(ReadOnlyTimestampAdmin):
    list_display = ("id", "session", "student_id", "last_name", "first_name", "submitted_at")
    search_fields = ("student_id", "first_name", "last_name", "session__session_key")
    readonly_fields = ("submitted_at",)


@admin.register(LiveTestDraft)
class LiveTestDraftAdmin(ReadOnlyTimestampAdmin):
    list_display = ("id", "session", "participant_key", "last_name", "first_name", "updated_at")
    search_fields = ("participant_key", "last_name", "first_name", "session__session_key")
    readonly_fields = ("updated_at",)


@admin.register(ClinicalGroup)
class ClinicalGroupAdmin(ReadOnlyTimestampAdmin):
    list_display = ("name", "code", "subscription_plan", "subscription_status", "is_active", "updated_at")
    list_filter = ("subscription_plan", "subscription_status", "is_active")
    search_fields = ("name", "code", "phone", "contact_person")
    readonly_fields = ("created_at", "updated_at")


@admin.register(ClinicalGroupMember)
class ClinicalGroupMemberAdmin(ReadOnlyTimestampAdmin):
    list_display = ("owner_key", "clinic", "app_role", "is_clinic_admin", "is_active", "joined_at")
    list_filter = ("app_role", "is_clinic_admin", "is_active", "clinic")
    search_fields = ("owner_key", "first_name", "last_name", "clinic__name")
    readonly_fields = ("joined_at", "updated_at")


@admin.register(ClinicalGroupPayment)
class ClinicalGroupPaymentAdmin(ReadOnlyTimestampAdmin):
    list_display = ("clinic", "period_start", "amount_uzs", "status", "paid_at", "created_at")
    list_filter = ("status", "clinic")
    search_fields = ("clinic__name", "notes")
    readonly_fields = ("created_at", "updated_at")


@admin.register(StartupProjectApplication)
class StartupProjectApplicationAdmin(ReadOnlyTimestampAdmin):
    list_display = ("id", "owner_key", "title", "status", "project_domain", "submitted_at", "updated_at")
    list_filter = ("status", "project_domain", "participant_kind")
    search_fields = ("owner_key", "title")
    readonly_fields = ("created_at", "updated_at", "submitted_at")


@admin.register(CampusBuilding)
class CampusBuildingAdmin(ReadOnlyTimestampAdmin):
    list_display = ("id", "name", "short_code", "is_active", "sort_order", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("name", "short_code", "notes")
    readonly_fields = ("created_at", "updated_at")


@admin.register(StaffScheduleSlot)
class StaffScheduleSlotAdmin(ReadOnlyTimestampAdmin):
    list_display = (
        "id",
        "owner_key",
        "week_phase",
        "weekday",
        "start_time",
        "end_time",
        "building_name",
        "is_active",
    )
    list_filter = ("weekday", "week_phase", "is_active")
    search_fields = ("owner_key", "building_name", "title")
    readonly_fields = ("created_at", "updated_at")


@admin.register(StaffLocationPing)
class StaffLocationPingAdmin(ReadOnlyTimestampAdmin):
    list_display = ("id", "owner_key", "latitude", "longitude", "recorded_at")
    search_fields = ("owner_key",)
    readonly_fields = ("recorded_at",)


@admin.register(StaffLocationAlert)
class StaffLocationAlertAdmin(ReadOnlyTimestampAdmin):
    list_display = ("id", "owner_key", "building_name", "distance_m", "created_at")
    search_fields = ("owner_key", "building_name", "message")
    readonly_fields = ("created_at",)


@admin.register(TopicHandout)
class TopicHandoutAdmin(ReadOnlyTimestampAdmin):
    list_display = ("id", "topic", "owner_key", "kind", "file_name", "created_at")
    list_filter = ("kind",)
    search_fields = ("topic", "topic_norm", "owner_key", "file_name", "title")
    readonly_fields = ("created_at",)


@admin.register(TopicPresentation)
class TopicPresentationAdmin(ReadOnlyTimestampAdmin):
    list_display = ("id", "topic", "owner_key", "kind", "file_name", "created_at")
    list_filter = ("kind",)
    search_fields = ("topic", "topic_norm", "owner_key", "file_name", "title")
    readonly_fields = ("created_at",)


@admin.register(DevicePairingSession)
class DevicePairingSessionAdmin(ReadOnlyTimestampAdmin):
    list_display = ("pairing_token", "owner_key", "role", "status", "created_at", "expires_at")
    list_filter = ("status", "role")
    search_fields = ("pairing_token", "owner_key")
    readonly_fields = ("created_at",)


@admin.register(StaffProfile)
class StaffProfileAdmin(ReadOnlyTimestampAdmin):
    list_display = ("owner_key", "updated_at")
    search_fields = ("owner_key",)
    readonly_fields = ("updated_at",)


class CustomUserAdmin(DjangoUserAdmin):
    list_display = ("username", "first_name", "last_name", "email", "is_staff", "is_superuser", "last_login")
    search_fields = ("username", "first_name", "last_name", "email")


class CustomGroupAdmin(DjangoGroupAdmin):
    search_fields = ("name",)


admin.site.unregister(User)
admin.site.unregister(Group)
admin.site.register(User, CustomUserAdmin)
admin.site.register(Group, CustomGroupAdmin)

# Jazzmin qidiruv uchun
User._meta.verbose_name = _("Foydalanuvchi")
User._meta.verbose_name_plural = _("Foydalanuvchilar")
Group._meta.verbose_name = _("Guruh")
Group._meta.verbose_name_plural = _("Guruhlar")
