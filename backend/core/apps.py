from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"
    verbose_name = _("Salomatlik AI tizimi")

    def ready(self) -> None:
        from django.apps import apps

        from .jazzmin_compat import patch_jazzmin_paginator_for_django6

        patch_jazzmin_paginator_for_django6()

        auth_config = apps.get_app_config("auth")
        auth_config.verbose_name = "Foydalanuvchilar va ruxsatlar"
