from __future__ import annotations

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from core.models import CampusBuilding

DEFAULT_FILE = Path(__file__).resolve().parents[2] / "data" / "campus_buildings.json"


class Command(BaseCommand):
    help = "Seed campus buildings from core/data/campus_buildings.json (deduplicated by name)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            default=str(DEFAULT_FILE),
            help="Path to campus_buildings.json",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print actions without writing to database",
        )

    def handle(self, *args, **options):
        data_path = Path(options["file"])
        if not data_path.is_file():
            raise CommandError(f"Data file not found: {data_path}")

        rows = json.loads(data_path.read_text(encoding="utf-8"))
        if not isinstance(rows, list):
            raise CommandError("JSON root must be an array.")

        dry_run = bool(options["dry_run"])
        created = updated = deactivated = 0
        seeded_names: set[str] = set()

        @transaction.atomic
        def _run():
            nonlocal created, updated, deactivated
            for row in rows:
                if not isinstance(row, dict):
                    continue
                name = (row.get("name") or "").strip()
                if not name:
                    continue
                seeded_names.add(name)
                defaults = {
                    "short_code": row.get("short_code", ""),
                    "latitude": row["latitude"],
                    "longitude": row["longitude"],
                    "radius_m": row.get("radius_m", 100),
                    "boundary": [],
                    "sort_order": row.get("sort_order", 0),
                    "notes": row.get("notes", ""),
                    "is_active": row.get("is_active", True),
                }
                if dry_run:
                    exists = CampusBuilding.objects.filter(name=name).exists()
                    action = "update" if exists else "create"
                    self.stdout.write(f"[dry-run] {action}: {name}")
                    continue
                obj, was_created = CampusBuilding.objects.update_or_create(
                    name=name,
                    defaults=defaults,
                )
                if was_created:
                    created += 1
                else:
                    updated += 1

            if not dry_run and seeded_names:
                deactivated = CampusBuilding.objects.filter(is_active=True).exclude(
                    name__in=seeded_names
                ).update(is_active=False)

        _run()
        if dry_run:
            self.stdout.write(self.style.SUCCESS(f"Dry run: {len(rows)} rows processed."))
        else:
            total = CampusBuilding.objects.filter(is_active=True).count()
            self.stdout.write(
                self.style.SUCCESS(
                    f"Done: {created} created, {updated} updated, {deactivated} deactivated. "
                    f"Active buildings: {total}."
                )
            )
