from __future__ import annotations

from django.conf import settings
from django.contrib.auth.models import Group, User
from django.core.management.base import BaseCommand

from core.permissions import ALLOWED_ROLES
from core.phone import normalize_uz_phone_digits

DEMO_PASSWORD = "Demo12345!"

DEMO_PHONES = {
    "admin": "998900000001",
    "klinika_admin": "998900000002",
    "hodim": "998900000003",
    "startuper": "998900000004",
}


class Command(BaseCommand):
    help = "Dev-only: ensure one demo user per role exists (admin, klinika_admin, hodim, startuper)."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            self.stdout.write("DEBUG=False — demo role users skipped (dev-only).")
            return

        for role in ALLOWED_ROLES:
            phone_raw = DEMO_PHONES[role]
            phone = normalize_uz_phone_digits(phone_raw)

            user, created = User.objects.get_or_create(
                username=phone,
                defaults={
                    "first_name": f"Demo",
                    "last_name": role,
                    "is_staff": role == "admin",
                    "is_superuser": role == "admin",
                },
            )
            user.set_password(DEMO_PASSWORD)
            user.is_staff = role == "admin"
            user.is_superuser = role == "admin"
            user.save(update_fields=["password", "is_staff", "is_superuser", "first_name", "last_name"])

            group, _ = Group.objects.get_or_create(name=role)
            for other_role in ALLOWED_ROLES:
                if other_role != role:
                    other_group = Group.objects.filter(name=other_role).first()
                    if other_group is not None:
                        user.groups.remove(other_group)
            user.groups.add(group)

            verb = "created" if created else "updated"
            self.stdout.write(
                self.style.SUCCESS(
                    f"demo_{role}: phone={phone} password={DEMO_PASSWORD} ({verb})"
                )
            )
