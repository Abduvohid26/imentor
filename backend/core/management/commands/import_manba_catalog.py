"""
manba/ papkasidan kafedra → fan → yo'nalish → mavzular ierarxiyasini bazaga import.

Ishlatish (backend ichida):
  python manage.py import_manba_catalog
  python manage.py import_manba_catalog --dry-run
  python manage.py import_manba_catalog --only "Fiziologiya"
  python manage.py import_manba_catalog --root /path/to/manba/fanlarning...

Talab: pdftotext (poppler-utils) o'rnatilgan bo'lishi kerak.
"""

from __future__ import annotations

import os
import subprocess
from collections import defaultdict
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from core.manba_catalog_utils import parse_fan_name, parse_variant_label, slug_code, subject_code_for
from core.models import AcademicDepartment, CourseSyllabus
from core.syllabus_topic_parse import extract_topics_by_regex

DEFAULT_MANBA_SUBDIR = "fanlarning yonalishilari va unga mos manbalar"


def extract_pdf_text(file_path: Path) -> str:
    try:
        proc = subprocess.run(
            ["pdftotext", "-layout", str(file_path), "-"],
            capture_output=True,
            text=True,
            check=False,
            timeout=120,
        )
    except FileNotFoundError as exc:
        raise CommandError("pdftotext topilmadi. poppler-utils o'rnating.") from exc
    if proc.returncode != 0:
        raise CommandError(f"pdftotext xato ({file_path.name}): {proc.stderr.strip()}")
    return proc.stdout or ""


def dedupe_variant_labels(variants: list[dict]) -> list[dict]:
    """Bir xil label bo'lsa — ko'proq mavzuli variant qoladi."""
    by_label: dict[str, dict] = {}
    for variant in variants:
        label = variant["label"]
        existing = by_label.get(label.lower())
        if not existing or len(variant.get("topics") or []) > len(existing.get("topics") or []):
            by_label[label.lower()] = variant
    return sorted(by_label.values(), key=lambda v: v["label"].lower())


class Command(BaseCommand):
    help = "manba/ dan kafedra → fan → yo'nalish → mavzular katalogini bazaga yozadi."

    def add_arguments(self, parser):
        parser.add_argument(
            "--root",
            default="",
            help="manba ichidagi PDF papka (default: <repo>/manba/fanlarning...)",
        )
        parser.add_argument(
            "--only",
            default="",
            help="Faqat shu kafedra papkasini import qilish",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Bazaga yozmasdan natijani ko'rsatish",
        )
        parser.add_argument(
            "--skip-existing",
            action="store_true",
            help="Mavjud fan (subject_code) bo'lsa o'tkazib yuborish",
        )
        parser.add_argument(
            "--deactivate-missing",
            action="store_true",
            help="Import qilinmagan eski fanlarni is_active=False qilish",
        )

    def handle(self, *args, **options):
        root = self._resolve_root(options["root"])
        if not root.is_dir():
            raise CommandError(f"Papka topilmadi: {root}")

        dry_run = bool(options["dry_run"])
        only = (options["only"] or "").strip()
        skip_existing = bool(options["skip_existing"])
        deactivate_missing = bool(options["deactivate_missing"])

        kafedra_dirs = sorted(
            [p for p in root.iterdir() if p.is_dir() and (not only or p.name == only)],
            key=lambda p: p.name.lower(),
        )
        if not kafedra_dirs:
            raise CommandError(f"Kafedra papkalari topilmadi: {root}")

        stats = {
            "departments": 0,
            "subjects_created": 0,
            "subjects_updated": 0,
            "subjects_skipped": 0,
            "variants_total": 0,
            "topics_total": 0,
            "pdf_skipped": 0,
            "pdf_errors": 0,
        }
        touched_subject_codes: set[str] = set()

        @transaction.atomic
        def _run():
            for sort_idx, kafedra_dir in enumerate(kafedra_dirs, start=1):
                self._import_kafedra(
                    kafedra_dir=kafedra_dir,
                    sort_idx=sort_idx,
                    dry_run=dry_run,
                    skip_existing=skip_existing,
                    stats=stats,
                    touched_subject_codes=touched_subject_codes,
                )

            if deactivate_missing and not dry_run:
                stale = CourseSyllabus.objects.exclude(subject_code__in=touched_subject_codes).filter(is_active=True)
                count = stale.update(is_active=False)
                if count:
                    self.stdout.write(self.style.WARNING(f"Nofaol qilindi: {count} ta eski fan"))

        _run()

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Import yakunlandi"))
        for key, value in stats.items():
            self.stdout.write(f"  {key}: {value}")

    def _resolve_root(self, root_opt: str) -> Path:
        if root_opt:
            return Path(root_opt).expanduser().resolve()

        env_root = (os.environ.get("MANBA_CATALOG_ROOT") or "").strip()
        if env_root:
            p = Path(env_root).expanduser()
            if p.is_dir():
                return p.resolve()

        backend_dir = Path(__file__).resolve().parents[3]
        candidates = [
            backend_dir.parent / "manba" / DEFAULT_MANBA_SUBDIR,
            backend_dir / "manba" / DEFAULT_MANBA_SUBDIR,
            Path("/manba") / DEFAULT_MANBA_SUBDIR,
        ]
        for candidate in candidates:
            if candidate.is_dir():
                return candidate.resolve()

        return candidates[0]

    def _import_kafedra(
        self,
        *,
        kafedra_dir: Path,
        sort_idx: int,
        dry_run: bool,
        skip_existing: bool,
        stats: dict,
        touched_subject_codes: set[str],
    ) -> None:
        kafedra_name = kafedra_dir.name.strip()
        dept_code = slug_code(kafedra_name)
        self.stdout.write(self.style.MIGRATE_HEADING(f"\n[{sort_idx}] Kafedra: {kafedra_name}"))

        if dry_run:
            department = None
        else:
            department, dept_created = AcademicDepartment.objects.update_or_create(
                code=dept_code,
                defaults={"name": kafedra_name, "sort_order": sort_idx, "is_active": True},
            )
            if dept_created:
                stats["departments"] += 1

        pdfs = sorted(
            {p.resolve() for p in kafedra_dir.iterdir() if p.is_file() and p.suffix.lower() == ".pdf"},
            key=lambda p: p.name.lower(),
        )
        if not pdfs:
            self.stdout.write(self.style.WARNING("  PDF yo'q"))
            return

        fan_groups: dict[str, list[dict]] = defaultdict(list)
        for pdf_path in pdfs:
            file_name = pdf_path.name
            fan_name = parse_fan_name(file_name)
            variant_label = parse_variant_label(file_name)
            try:
                text = extract_pdf_text(pdf_path)
                topics = extract_topics_by_regex(text)
            except CommandError as exc:
                stats["pdf_errors"] += 1
                self.stdout.write(self.style.ERROR(f"  [xato] {file_name}: {exc}"))
                continue

            if not topics:
                stats["pdf_skipped"] += 1
                self.stdout.write(self.style.WARNING(f"  [0 mavzu] {file_name}"))
                continue

            fan_groups[fan_name.lower()].append(
                {
                    "fan_name": fan_name,
                    "label": variant_label,
                    "file_name": file_name,
                    "topics": topics,
                }
            )
            self.stdout.write(
                f"  [ok] {fan_name} / {variant_label} — {len(topics)} mavzu ({file_name})"
            )

        for fan_key, entries in sorted(fan_groups.items(), key=lambda x: x[1][0]["fan_name"].lower()):
            fan_name = entries[0]["fan_name"]
            variants = dedupe_variant_labels(
                [
                    {
                        "label": entry["label"],
                        "file_name": entry["file_name"],
                        "topics": entry["topics"],
                    }
                    for entry in entries
                ]
            )
            if not variants:
                continue

            subject_code = subject_code_for(dept_code, fan_name)
            touched_subject_codes.add(subject_code)
            topic_count = sum(len(v.get("topics") or []) for v in variants)
            stats["variants_total"] += len(variants)
            stats["topics_total"] += topic_count

            if dry_run:
                self.stdout.write(
                    f"  → Fan: {fan_name} | {len(variants)} yo'nalish | {topic_count} mavzu | code={subject_code}"
                )
                continue

            existing = CourseSyllabus.objects.filter(subject_code=subject_code).first()
            if existing and skip_existing:
                stats["subjects_skipped"] += 1
                self.stdout.write(f"  [skip] {fan_name} ({subject_code})")
                continue

            payload = {
                "subject_name": fan_name[:255],
                "department": department,
                "description": f"Kafedra: {kafedra_name}"[:512],
                "instruction_language": CourseSyllabus.LANG_UZ,
                "variants": variants,
                "file_name": variants[0]["file_name"],
                "topics": variants[0]["topics"],
                "sort_order": sort_idx,
                "is_active": True,
            }

            if existing:
                for field, value in payload.items():
                    setattr(existing, field, value)
                existing.save()
                stats["subjects_updated"] += 1
                self.stdout.write(f"  [yangilandi] {fan_name} ({subject_code})")
            else:
                CourseSyllabus.objects.create(subject_code=subject_code, **payload)
                stats["subjects_created"] += 1
                self.stdout.write(f"  [yaratildi] {fan_name} ({subject_code})")
