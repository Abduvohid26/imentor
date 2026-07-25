"""
books/ papkasidagi 7z arxivlardan darsliklarni import qiladi: extract -> pdftotext ->
chunk -> OpenAI embedding -> SubjectBook/BookChunk.

Ishlatish (backend ichida):
  python manage.py import_subject_books --only "Fiziologiya"
  python manage.py import_subject_books --only "Fiziologiya" --dry-run
  python manage.py import_subject_books
  python manage.py import_subject_books --root /path/to/books

Talab: pdftotext (poppler-utils), 7z (p7zip-full) o'rnatilgan bo'lishi kerak.
"""

from __future__ import annotations

import os
import re
import subprocess
import tempfile
from pathlib import Path

from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from core.manba_catalog_utils import slug_code
from core.models import AcademicDepartment, BookChunk, SubjectBook
from core.openai_client import OpenAiClientError, create_embeddings

# Arxiv nomi kafedra nomiga to'g'ridan-to'g'ri (slug orqali) mos kelmasa,
# shu yerga qo'lda moslashtirish qo'shiladi: {arxiv bazasi -> AcademicDepartment.code}
DEPARTMENT_ALIASES: dict[str, str] = {}

ARCHIVE_PREFIX_RE = re.compile(r"^\d+\.\s*")
CHUNK_TARGET_CHARS = 1100
CHUNK_MIN_CHARS = 300
EMBED_BATCH = 96


def department_name_from_archive(archive_stem: str) -> str:
    return ARCHIVE_PREFIX_RE.sub("", archive_stem).strip()


def extract_pdf_text_pages(pdf_path: Path) -> list[str]:
    try:
        proc = subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), "-"],
            capture_output=True,
            text=True,
            check=False,
            timeout=600,
        )
    except FileNotFoundError as exc:
        raise CommandError("pdftotext topilmadi. poppler-utils o'rnating.") from exc
    if proc.returncode != 0:
        raise CommandError(f"pdftotext xato ({pdf_path.name}): {proc.stderr.strip()}")
    return (proc.stdout or "").split("\f")


def build_chunks(pages: list[str]) -> list[tuple[int, int, str]]:
    """[(page_start, page_end, text)] — sahifalarni ~CHUNK_TARGET_CHARS gacha guruhlaydi."""
    chunks: list[tuple[int, int, str]] = []
    buf_text = ""
    buf_start: int | None = None
    buf_end: int | None = None

    def flush() -> None:
        nonlocal buf_text, buf_start, buf_end
        if buf_text.strip() and buf_start is not None and buf_end is not None:
            chunks.append((buf_start, buf_end, buf_text.strip()))
        buf_text, buf_start, buf_end = "", None, None

    for page_idx, raw_page in enumerate(pages, start=1):
        text = raw_page.strip()
        if not text:
            continue
        if buf_start is None:
            buf_start = page_idx
        buf_end = page_idx
        buf_text = f"{buf_text}\n\n{text}" if buf_text else text
        if len(buf_text) >= CHUNK_TARGET_CHARS:
            flush()
    if buf_text and len(buf_text) < CHUNK_MIN_CHARS and chunks:
        prev_start, _prev_end, prev_text = chunks[-1]
        chunks[-1] = (prev_start, buf_end, f"{prev_text}\n\n{buf_text.strip()}")
    else:
        flush()
    return chunks


class Command(BaseCommand):
    help = "books/ dagi 7z darsliklarni extract qilib, chunk+embedding sifatida bazaga yozadi."

    def add_arguments(self, parser):
        parser.add_argument("--root", default="", help="books/ papkasi (default: <repo>/books yoki /books)")
        parser.add_argument("--only", default="", help="Faqat shu arxiv nomiga mos kafedrani import qilish (masalan 'Fiziologiya')")
        parser.add_argument("--dry-run", action="store_true", help="Bazaga yozmasdan tekshirish")
        parser.add_argument("--skip-existing", action="store_true", default=True, help="Mavjud source_archive bo'lsa o'tkazib yuborish (default: yoqilgan)")
        parser.add_argument("--force", action="store_true", help="--skip-existing ni bekor qilib, qayta import qiladi")

    def handle(self, *args, **options):
        root = self._resolve_root(options["root"])
        if not root.is_dir():
            raise CommandError(f"Papka topilmadi: {root}")

        api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        dry_run = bool(options["dry_run"])
        if not dry_run and not api_key:
            raise CommandError("OPENAI_API_KEY o'rnatilmagan (embedding uchun kerak).")

        only = (options["only"] or "").strip().lower()
        skip_existing = bool(options["skip_existing"]) and not bool(options["force"])

        archives = sorted(
            [p for p in root.iterdir() if p.is_file() and p.suffix.lower() == ".7z"],
            key=lambda p: p.name.lower(),
        )
        if only:
            archives = [
                p for p in archives
                if department_name_from_archive(p.stem).lower().startswith(only)
            ]
        if not archives:
            raise CommandError(f"7z arxiv topilmadi: {root} (only={only!r})")

        stats = {"archives": 0, "books": 0, "books_skipped": 0, "chunks": 0}

        for archive_path in archives:
            self._import_archive(
                archive_path=archive_path,
                api_key=api_key,
                dry_run=dry_run,
                skip_existing=skip_existing,
                stats=stats,
            )

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Import yakunlandi"))
        for key, value in stats.items():
            self.stdout.write(f"  {key}: {value}")

    def _resolve_root(self, root_opt: str) -> Path:
        if root_opt:
            return Path(root_opt).expanduser().resolve()
        backend_dir = Path(__file__).resolve().parents[3]
        for candidate in (backend_dir.parent / "books", Path("/books")):
            if candidate.is_dir():
                return candidate.resolve()
        return (backend_dir.parent / "books").resolve()

    def _resolve_department(self, archive_path: Path, sort_idx: int, dry_run: bool) -> AcademicDepartment | None:
        dept_name = department_name_from_archive(archive_path.stem)
        dept_code = DEPARTMENT_ALIASES.get(archive_path.stem) or slug_code(dept_name)

        department = AcademicDepartment.objects.filter(code=dept_code).first()
        if department:
            return department

        self.stdout.write(
            self.style.WARNING(f"  Kafedra topilmadi (code={dept_code}) — yangi kafedra yaratiladi: {dept_name}")
        )
        if dry_run:
            return None
        department, _created = AcademicDepartment.objects.get_or_create(
            code=dept_code,
            defaults={"name": dept_name, "sort_order": sort_idx, "is_active": True},
        )
        return department

    def _import_archive(self, *, archive_path: Path, api_key: str, dry_run: bool, skip_existing: bool, stats: dict) -> None:
        stats["archives"] += 1
        dept_name = department_name_from_archive(archive_path.stem)
        self.stdout.write(self.style.MIGRATE_HEADING(f"\n[{archive_path.name}] Kafedra: {dept_name}"))

        department = self._resolve_department(archive_path, stats["archives"], dry_run)
        if department is None and not dry_run:
            self.stdout.write(self.style.ERROR("  Kafedra aniqlanmadi, o'tkazib yuborildi"))
            return

        with tempfile.TemporaryDirectory(prefix="imentor_book_") as tmp_dir:
            self._extract_7z(archive_path, Path(tmp_dir))
            pdf_paths = sorted(Path(tmp_dir).rglob("*.pdf"), key=lambda p: p.name.lower())
            if not pdf_paths:
                self.stdout.write(self.style.WARNING("  PDF topilmadi"))
                return

            for pdf_path in pdf_paths:
                title = pdf_path.stem.strip()
                if skip_existing and not dry_run:
                    exists = SubjectBook.objects.filter(
                        source_archive=archive_path.name, title=title
                    ).exists()
                    if exists:
                        stats["books_skipped"] += 1
                        self.stdout.write(f"  [skip] {title}")
                        continue

                self.stdout.write(f"  [pdf] {title} ({pdf_path.stat().st_size / 1_000_000:.1f} MB)")
                pages = extract_pdf_text_pages(pdf_path)
                chunks = build_chunks(pages)
                if not chunks:
                    self.stdout.write(self.style.WARNING(f"    matn topilmadi: {title}"))
                    continue

                if dry_run:
                    self.stdout.write(f"    -> {len(chunks)} chunk, {len(pages)} sahifa")
                    continue

                self._save_book(
                    department=department,
                    archive_name=archive_path.name,
                    title=title,
                    pdf_path=pdf_path,
                    page_count=len(pages),
                    chunks=chunks,
                    api_key=api_key,
                    stats=stats,
                )

    def _extract_7z(self, archive_path: Path, dest_dir: Path) -> None:
        try:
            proc = subprocess.run(
                ["7z", "x", "-y", f"-o{dest_dir}", str(archive_path)],
                capture_output=True,
                text=True,
                check=False,
                timeout=1800,
            )
        except FileNotFoundError as exc:
            raise CommandError("7z topilmadi. p7zip-full o'rnating.") from exc
        if proc.returncode != 0:
            raise CommandError(f"7z xato ({archive_path.name}): {proc.stderr.strip()}")

    @transaction.atomic
    def _save_book(
        self,
        *,
        department: AcademicDepartment,
        archive_name: str,
        title: str,
        pdf_path: Path,
        page_count: int,
        chunks: list[tuple[int, int, str]],
        api_key: str,
        stats: dict,
    ) -> None:
        book = SubjectBook.objects.create(
            department=department,
            title=title[:512],
            source_archive=archive_name,
            page_count=page_count,
        )
        with pdf_path.open("rb") as fh:
            book.file.save(pdf_path.name, File(fh), save=True)

        try:
            embeddings = create_embeddings(api_key, [c[2] for c in chunks], batch_size=EMBED_BATCH)
        except OpenAiClientError as exc:
            raise CommandError(f"Embedding xatosi ({title}): {exc}") from exc

        rows = [
            BookChunk(
                book=book,
                department=department,
                chunk_index=idx,
                page_start=page_start,
                page_end=page_end,
                text=text,
                embedding=embedding,
            )
            for idx, ((page_start, page_end, text), embedding) in enumerate(zip(chunks, embeddings))
        ]
        BookChunk.objects.bulk_create(rows, batch_size=200)

        stats["books"] += 1
        stats["chunks"] += len(rows)
        self.stdout.write(self.style.SUCCESS(f"    saqlandi: {len(rows)} chunk"))
