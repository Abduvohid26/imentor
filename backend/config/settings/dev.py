import sys

from .base import *  # noqa: F403,F401

DEBUG = True

# Unit testlar: alohida Postgres/Redis kerak emas.
if "test" in sys.argv:
    DATABASES = {  # noqa: F405
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": ":memory:",
        }
    }
    CACHES = {  # noqa: F405
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "imentor-test",
        }
    }
    REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {  # noqa: F405
        scope: "10000/minute"
        for scope in REST_FRAMEWORK.get("DEFAULT_THROTTLE_RATES", {})
    }
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True
    CELERY_BROKER_URL = "memory://"
    CELERY_RESULT_BACKEND = "cache+memory://"
