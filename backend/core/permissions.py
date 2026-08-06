from __future__ import annotations

from rest_framework.permissions import BasePermission

# Xodim / ta'lim rollari (o'qituvchi paneli)
STAFF_ROLES = ("admin", "klinika_admin", "hodim")
# OnlineTest orqali kelgan talaba (shadow user + JWT claim)
STUDENT_ROLE = "student"
ALLOWED_ROLES = STAFF_ROLES + (STUDENT_ROLE,)


def _jwt_role_claim(request) -> str | None:
    """
    LocalLoginView access tokeniga qo'shilgan `role` (imzolangan).
    Faqat DB guruhlari bo'lmasa fallback sifatida ishlatiladi.
    """
    if request is None or not hasattr(request, "auth") or request.auth is None:
        return None
    auth = request.auth
    raw: object | None = None
    try:
        if isinstance(auth, dict):
            raw = auth.get("role")
        elif hasattr(auth, "get"):
            raw = auth.get("role", None)
        if raw is None and hasattr(auth, "__getitem__"):
            try:
                raw = auth["role"]
            except (KeyError, TypeError):
                raw = None
    except Exception:
        return None
    if not isinstance(raw, str):
        return None
    r = raw.strip().lower()
    return r if r in ALLOWED_ROLES else None


def _jwt_student_id_claim(request) -> str | None:
    if request is None or not hasattr(request, "auth") or request.auth is None:
        return None
    auth = request.auth
    raw: object | None = None
    try:
        if isinstance(auth, dict):
            raw = auth.get("student_id")
        elif hasattr(auth, "get"):
            raw = auth.get("student_id", None)
        if raw is None and hasattr(auth, "__getitem__"):
            try:
                raw = auth["student_id"]
            except (KeyError, TypeError):
                raw = None
    except Exception:
        return None
    if raw is None:
        return None
    s = str(raw).strip()
    return s or None


def resolve_user_role_from_db(user) -> str | None:
    """DB guruhlari — asosiy manba (JWT dan ustun)."""
    if not user or not user.is_authenticated:
        return None
    if getattr(user, "is_superuser", False):
        return "admin"
    group_names = {group.name.lower() for group in user.groups.all()}
    for role in ALLOWED_ROLES:
        if role in group_names:
            return role
    # Eski startuper guruhini hodim deb hisoblaymiz.
    if "startuper" in group_names:
        return "hodim"
    return None


def resolve_user_role(user, request=None) -> str | None:
    if not user or not user.is_authenticated:
        return None
    db_role = resolve_user_role_from_db(user)
    if db_role is not None:
        return db_role
    if request is not None:
        jwt_role = _jwt_role_claim(request)
        if jwt_role is not None:
            return jwt_role
    return None


def resolve_student_id(user, request=None) -> str | None:
    """OnlineTest talaba ID — JWT claim yoki shadow username `ot_<id>`."""
    claim = _jwt_student_id_claim(request) if request is not None else None
    if claim:
        return claim
    if not user or not user.is_authenticated:
        return None
    uname = str(getattr(user, "username", "") or "")
    if uname.startswith("ot_"):
        sid = uname[3:].strip()
        return sid or None
    return None


def user_has_admin_db_role(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    if getattr(user, "is_superuser", False):
        return True
    return user.groups.filter(name__iexact="admin").exists()


class HasEducationRole(BasePermission):
    """Xodim rollari: admin, hodim, klinika_admin (talaba emas)."""

    message = "You do not have a permitted role for this endpoint."

    def has_permission(self, request, view) -> bool:
        role = resolve_user_role(request.user, request)
        return role in STAFF_ROLES


class HasAnyPlatformRole(BasePermission):
    """Xodim yoki talaba — /auth/me kabi umumiy endpointlar."""

    message = "You do not have a permitted role for this endpoint."

    def has_permission(self, request, view) -> bool:
        return resolve_user_role(request.user, request) is not None


class IsStudentRole(BasePermission):
    message = "Faqat talaba roli ruxsat etilgan."

    def has_permission(self, request, view) -> bool:
        return resolve_user_role(request.user, request) == STUDENT_ROLE


class IsAdminRole(BasePermission):
    message = "Administrator huquqi kerak."

    def has_permission(self, request, view) -> bool:
        return user_has_admin_db_role(request.user)


class IsKlinikaAdminRole(BasePermission):
    message = "Klinika administratori huquqi kerak."

    def has_permission(self, request, view) -> bool:
        role = resolve_user_role_from_db(request.user)
        return role == "klinika_admin"


class IsAdminOrKlinikaAdmin(BasePermission):
    message = "Administrator yoki klinika administratori huquqi kerak."

    def has_permission(self, request, view) -> bool:
        role = resolve_user_role_from_db(request.user)
        return role in ("admin", "klinika_admin")


class IsStartuperOrAdmin(BasePermission):
    """Legacy: startuper moduli o'chirilgan — faqat admin."""

    message = "Administrator huquqi kerak."

    def has_permission(self, request, view) -> bool:
        return user_has_admin_db_role(request.user)


class IsHodimRole(BasePermission):
    """Faqat o'qituvchi (hodim) — joylashuv pinglari."""

    message = "Faqat hodim roli joylashuv yuborishi mumkin."

    def has_permission(self, request, view) -> bool:
        return resolve_user_role_from_db(request.user) == "hodim"
