from __future__ import annotations

import os

from django.contrib.auth.models import Group, User
from django.core.management.base import BaseCommand

from core.phone import normalize_uz_phone_digits


class Command(BaseCommand):
    help = "Ensure Django admin superuser exists for phone-based login."

    def handle(self, *args, **options):
        password = (os.getenv("ADMIN_PASSWORD") or "").strip()
        if not password:
            self.stdout.write("ADMIN_PASSWORD not set — skipping admin provisioning.")
            return

        phone_raw = (os.getenv("ADMIN_PHONE") or "998907863888").strip()
        try:
            phone = normalize_uz_phone_digits(phone_raw)
        except ValueError as exc:
            self.stderr.write(self.style.ERROR(str(exc)))
            return

        user, created = User.objects.get_or_create(
            username=phone,
            defaults={
                "is_staff": True,
                "is_superuser": True,
                "first_name": "Admin",
            },
        )
        user.is_staff = True
        user.is_superuser = True
        user.set_password(password)
        user.save(update_fields=["password", "is_staff", "is_superuser"])

        group, _ = Group.objects.get_or_create(name="admin")
        user.groups.add(group)

        verb = "created" if created else "updated"
        self.stdout.write(self.style.SUCCESS(f"Admin superuser {verb}: {phone}"))
