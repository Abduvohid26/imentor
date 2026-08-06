from __future__ import annotations

import os

from django.conf import settings
from django.contrib.auth.models import Group, User
from django.core.management.base import BaseCommand

from core.permissions import STAFF_ROLES
from core.phone import normalize_uz_phone_digits

from config.settings.env import env_bool

DEFAULT_DEMO_CREDENTIALS: dict[str, tuple[str, str]] = {
    "admin": ("998901110001", "AdminDemo123"),
    "klinika_admin": ("998900000002", "Demo12345!"),
    "hodim": ("998901112233", "TestHodim123"),
}


def demo_credentials_for_role(role: str) -> tuple[str, str]:
    phone_default, password_default = DEFAULT_DEMO_CREDENTIALS[role]
    phone = (os.getenv(f"DEMO_{role.upper()}_PHONE") or phone_default).strip()
    password = (os.getenv(f"DEMO_{role.upper()}_PASSWORD") or password_default).strip()
    return phone, password


def should_ensure_demo_users() -> bool:
    if env_bool("DJANGO_ENSURE_DEMO_USERS", default=False):
        return True
    return bool(settings.DEBUG)


class Command(BaseCommand):
    help = (
        "Ensure demo users per role (admin, klinika_admin, hodim). "
        "Runs in DEBUG=True or when DJANGO_ENSURE_DEMO_USERS=True."
    )

    def handle(self, *args, **options):
        if not should_ensure_demo_users():
            self.stdout.write("Demo role users skipped (set DJANGO_ENSURE_DEMO_USERS=True to enable).")
            return

        for role in STAFF_ROLES:
            phone_raw, password = demo_credentials_for_role(role)
            if len(password) < 6:
                self.stderr.write(
                    self.style.ERROR(f"demo_{role}: password too short — skipped.")
                )
                continue

            phone = normalize_uz_phone_digits(phone_raw)

            user, created = User.objects.get_or_create(
                username=phone,
                defaults={
                    "first_name": "Demo",
                    "last_name": role,
                    "is_staff": role == "admin",
                    "is_superuser": role == "admin",
                },
            )
            user.set_password(password)
            user.is_staff = role == "admin"
            user.is_superuser = role == "admin"
            user.first_name = user.first_name or "Demo"
            user.last_name = role
            user.save(
                update_fields=[
                    "password",
                    "is_staff",
                    "is_superuser",
                    "first_name",
                    "last_name",
                ]
            )

            group, _ = Group.objects.get_or_create(name=role)
            for other_role in STAFF_ROLES:
                if other_role != role:
                    other_group = Group.objects.filter(name=other_role).first()
                    if other_group is not None:
                        user.groups.remove(other_group)
            user.groups.add(group)

            verb = "created" if created else "updated"
            self.stdout.write(
                self.style.SUCCESS(
                    f"demo_{role}: phone={phone} password={password} ({verb})"
                )
            )
