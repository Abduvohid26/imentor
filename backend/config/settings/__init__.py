from __future__ import annotations

import os

env_name = os.getenv("DJANGO_ENV", "dev").strip().lower()

if env_name == "prod":
    from .prod import *  # noqa: F403,F401
else:
    from .dev import *  # noqa: F403,F401
