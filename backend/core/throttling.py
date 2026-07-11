"""AI proxy endpointlari uchun foydalanuvchi boshiga limit."""

from __future__ import annotations

from rest_framework.throttling import SimpleRateThrottle


class _UserScopedRateThrottle(SimpleRateThrottle):
    scope = ""

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None
        ident = request.user.pk
        return self.cache_format % {"scope": self.scope, "ident": ident}


class _AnonScopedRateThrottle(SimpleRateThrottle):
    scope = ""

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        if not ident:
            return None
        return self.cache_format % {"scope": self.scope, "ident": ident}


class EducationAiUserThrottle(_UserScopedRateThrottle):
    scope = "education_ai"


class StartupAiUserThrottle(_UserScopedRateThrottle):
    scope = "startup_ai"


class LoginRateThrottle(_AnonScopedRateThrottle):
    """Login/register — IP boshiga limit (brute-force oldini olish)."""

    scope = "login"


class LiveTestAnonThrottle(_AnonScopedRateThrottle):
    """QR test — anon POST/GET limit."""

    scope = "live_test_anon"


class StaffPingRateThrottle(_UserScopedRateThrottle):
    """GPS ping — hodim boshiga limit."""

    scope = "staff_ping"
