import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403,F401

DEBUG = False

# Docker volume + nginx proxy: backend /media/ fayllarni beradi.
DJANGO_SERVE_MEDIA = env_bool("DJANGO_SERVE_MEDIA", default=True)  # noqa: F405

# Productionda ochiq register default o'chiq.
ALLOW_OPEN_REGISTRATION = env_bool("DJANGO_ALLOW_OPEN_REGISTRATION", default=False)  # noqa: F405


def _secret_key_is_insecure(key: str) -> bool:
    k = (key or "").strip()
    if len(k) < 40:
        return True
    low = k.lower()
    insecure_starts = (
        "change_me",
        "change-me",
        "changeme",
        "django-insecure",
        "please_replace",
        "replace_with",
        "your-secret",
    )
    return any(low.startswith(p) for p in insecure_starts)


if _secret_key_is_insecure(SECRET_KEY):  # noqa: F405
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY in deploy/.env.production must be at least 40 random characters "
        '(not the example placeholder). Generate: python -c "import secrets; print(secrets.token_urlsafe(48))"'
    )

if not ALLOWED_HOSTS or ALLOWED_HOSTS == ["*"]:  # noqa: F405
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must be set in production (no wildcard).")

if CORS_ALLOW_ALL_ORIGINS:  # noqa: F405
    raise ImproperlyConfigured("DJANGO_CORS_ALLOW_ALL_ORIGINS must be False in production.")

if not os.getenv("REDIS_URL", "").strip():  # noqa: F405
    raise ImproperlyConfigured("REDIS_URL must be set in production (docker compose redis service).")

if not os.getenv("DJANGO_DB_PASSWORD", "").strip():  # noqa: F405
    raise ImproperlyConfigured("DJANGO_DB_PASSWORD / POSTGRES_PASSWORD must be set in production.")

if not os.getenv("_BEHIND_PROXY", "").strip():  # noqa: F405
    import warnings

    warnings.warn(
        "DJANGO_BEHIND_PROXY is not enabled — set True when nginx/Cloudflare proxies HTTPS.",
        stacklevel=1,
    )
