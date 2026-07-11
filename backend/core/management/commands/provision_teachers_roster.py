from __future__ import annotations

import json
from pathlib import Path

from django.contrib.auth.models import Group, User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from core.phone import normalize_uz_phone_digits


class Command(BaseCommand):
    help = "Register teachers from a JSON roster (phone as username, hodim role)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            required=True,
            help="Path to teachers_roster.json",
        )
        parser.add_argument(
            "--password",
            required=True,
            help="Password to set for every teacher in the roster (min 6 chars)",
        )
        parser.add_argument(
            "--role",
            default="hodim",
            help="Django group role (default: hodim)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print actions without writing to database",
        )

    def handle(self, *args, **options):
        roster_path = Path(options["file"])
        if not roster_path.is_file():
            raise CommandError(f"Roster file not found: {roster_path}")

        password = (options["password"] or "").strip()
        if len(password) < 6:
            raise CommandError("Password must be at least 6 characters.")

        role = (options["role"] or "hodim").strip().lower()
        dry_run = bool(options["dry_run"])

        rows = json.loads(roster_path.read_text(encoding="utf-8"))
        if not isinstance(rows, list):
            raise CommandError("Roster must be a JSON array.")

        group, _ = Group.objects.get_or_create(name=role)
        seen_phones: set[str] = set()
        created = updated = skipped = 0

        @transaction.atomic
        def _run():
            nonlocal created, updated, skipped
            for row in rows:
                if not isinstance(row, dict):
                    skipped += 1
                    continue

                phone_raw = (row.get("phone_digits") or row.get("phone_display") or "").strip()
                if not phone_raw:
                    skipped += 1
                    continue

                try:
                    phone = normalize_uz_phone_digits(phone_raw)
                except ValueError:
                    skipped += 1
                    continue

                if phone in seen_phones:
                    skipped += 1
                    continue
                seen_phones.add(phone)

                first_name = (row.get("first_name") or "").strip()
                last_name = (row.get("last_name") or "").strip()

                if dry_run:
                    exists = User.objects.filter(username=phone).exists()
                    verb = "update" if exists else "create"
                    self.stdout.write(f"[dry-run] would {verb}: {phone} {first_name} {last_name}")
                    if exists:
                        updated += 1
                    else:
                        created += 1
                    continue

                user, was_created = User.objects.get_or_create(
                    username=phone,
                    defaults={
                        "first_name": first_name,
                        "last_name": last_name,
                    },
                )
                user.first_name = first_name or user.first_name
                user.last_name = last_name or user.last_name
                user.set_password(password)
                user.save(update_fields=["password", "first_name", "last_name"])

                for other_role in ("admin", "hodim", "startuper"):
                    other = Group.objects.filter(name=other_role).first()
                    if other is not None:
                        user.groups.remove(other)
                user.groups.add(group)

                if was_created:
                    created += 1
                else:
                    updated += 1

        _run()
        self.stdout.write(
            self.style.SUCCESS(
                f"PROVISION_OK created={created} updated={updated} skipped={skipped} role={role}"
            )
        )
