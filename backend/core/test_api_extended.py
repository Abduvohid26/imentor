"""Qo'shimcha API testlari — health, auth, pagination, throttling."""

from __future__ import annotations

from django.contrib.auth.models import Group, User
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient


@override_settings(SECURE_SSL_REDIRECT=False, ALLOW_LEGACY_PREPARED_CONTENT_API=True)
class ApiExtendedTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        cache.clear()

    def test_health_endpoint(self) -> None:
        resp = self.client.get("/api/health/")
        self.assertEqual(resp.status_code, 200)

    def test_local_login_rejects_invalid_phone(self) -> None:
        resp = self.client.post(
            "/api/v1/auth/local-login/",
            {"phone_digits": "12345", "password": "StrongPass123", "register": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_login_rate_throttle_blocks_burst(self) -> None:
        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory

        from core.throttling import LoginRateThrottle
        from core.views import LocalLoginView

        factory = APIRequestFactory()
        throttle = LoginRateThrottle()
        throttle.rate = "3/minute"
        throttle.num_requests, throttle.duration = throttle.parse_rate(throttle.rate)
        cache.clear()
        view = LocalLoginView()
        for _ in range(3):
            req = Request(factory.post("/api/v1/auth/local-login/"))
            self.assertTrue(throttle.allow_request(req, view))
        blocked = Request(factory.post("/api/v1/auth/local-login/"))
        self.assertFalse(throttle.allow_request(blocked, view))

    def test_staff_ping_throttle_per_user(self) -> None:
        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory, force_authenticate

        from core.throttling import StaffPingRateThrottle
        from core.views import StaffLocationPingView

        user = User.objects.create_user(username="998901112310", password="x")
        factory = APIRequestFactory()
        wsgi_request = factory.post("/api/v1/staff/location-ping/")
        force_authenticate(wsgi_request, user=user)
        request = Request(wsgi_request)
        view = StaffLocationPingView()

        throttle = StaffPingRateThrottle()
        throttle.rate = "2/minute"
        throttle.num_requests, throttle.duration = throttle.parse_rate(throttle.rate)
        cache.clear()

        self.assertTrue(throttle.allow_request(request, view))
        self.assertTrue(throttle.allow_request(request, view))
        self.assertFalse(throttle.allow_request(request, view))

    def test_auth_me_requires_jwt(self) -> None:
        resp = self.client.get("/api/v1/auth/me/")
        self.assertEqual(resp.status_code, 401)

    def test_auth_me_returns_profile(self) -> None:
        Group.objects.get_or_create(name="hodim")
        reg = self.client.post(
            "/api/v1/auth/local-login/",
            {
                "phone_digits": "998901112311",
                "password": "StrongPass123",
                "role": "hodim",
                "register": True,
                "first_name": "Ali",
                "last_name": "Karimov",
            },
            format="json",
        )
        token = reg.json()["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        me = self.client.get("/api/v1/auth/me/")
        self.assertEqual(me.status_code, 200)
        body = me.json()
        self.assertEqual(body["username"], "998901112311")
        self.assertEqual(body["first_name"], "Ali")
        self.assertEqual(body["role"], "hodim")
        self.assertIn("photo_url", body)

    def test_token_refresh_returns_new_access(self) -> None:
        Group.objects.get_or_create(name="startuper")
        reg = self.client.post(
            "/api/v1/auth/local-login/",
            {
                "phone_digits": "998901112313",
                "password": "StrongPass123",
                "role": "startuper",
                "register": True,
            },
            format="json",
        )
        self.assertEqual(reg.status_code, 200, reg.content)
        refresh = reg.json()["refresh"]
        resp = self.client.post(
            "/api/v1/auth/token/refresh/",
            {"refresh": refresh},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertTrue(resp.json().get("access"))

    def test_live_test_anon_throttle_blocks_burst(self) -> None:
        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory

        from core.throttling import LiveTestAnonThrottle
        from core.views import LiveTestPublicRetrieveView

        factory = APIRequestFactory()
        throttle = LiveTestAnonThrottle()
        throttle.rate = "2/minute"
        throttle.num_requests, throttle.duration = throttle.parse_rate(throttle.rate)
        cache.clear()
        view = LiveTestPublicRetrieveView()
        for _ in range(2):
            req = Request(factory.get("/api/v1/live-tests/demo/"))
            self.assertTrue(throttle.allow_request(req, view))
        blocked = Request(factory.get("/api/v1/live-tests/demo/"))
        self.assertFalse(throttle.allow_request(blocked, view))

    def test_startup_ai_throttle_blocks_burst(self) -> None:
        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory, force_authenticate

        from core.startup_ai_views import StartupAiQuestionnaireView
        from core.throttling import StartupAiUserThrottle

        user = User.objects.create_user(username="998901114060", password="x")
        factory = APIRequestFactory()
        wsgi = factory.post("/api/v1/startup-ai/questionnaire/")
        force_authenticate(wsgi, user=user)
        request = Request(wsgi)
        view = StartupAiQuestionnaireView()
        throttle = StartupAiUserThrottle()
        throttle.rate = "2/minute"
        throttle.num_requests, throttle.duration = throttle.parse_rate(throttle.rate)
        cache.clear()
        self.assertTrue(throttle.allow_request(request, view))
        self.assertTrue(throttle.allow_request(request, view))
        self.assertFalse(throttle.allow_request(request, view))

    def test_startup_applications_require_startuper(self) -> None:
        Group.objects.get_or_create(name="startuper")
        Group.objects.get_or_create(name="hodim")

        startuper_login = self.client.post(
            "/api/v1/auth/local-login/",
            {
                "phone_digits": "998901112312",
                "password": "StrongPass123",
                "role": "startuper",
                "register": True,
            },
            format="json",
        )
        self.assertEqual(startuper_login.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {startuper_login.json()['access']}")
        ok = self.client.get("/api/v1/startup-applications/")
        self.assertEqual(ok.status_code, 200)

        hodim_login = self.client.post(
            "/api/v1/auth/local-login/",
            {
                "phone_digits": "998901112313",
                "password": "StrongPass123",
                "role": "hodim",
                "register": True,
            },
            format="json",
        )
        self.assertEqual(hodim_login.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {hodim_login.json()['access']}")
        denied = self.client.get("/api/v1/startup-applications/")
        self.assertEqual(denied.status_code, 403)

    def test_device_pair_create_returns_secret(self) -> None:
        resp = self.client.post("/api/v1/device-pair/create/", {}, format="json")
        self.assertEqual(resp.status_code, 201)
        body = resp.json()
        self.assertTrue(body.get("pairing_token"))
        self.assertTrue(body.get("desktop_secret"))
