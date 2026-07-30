"""Mavjud testlarga darslik manbasini biriktiradi va izohlarni yangilaydi.

Ishlatish (avval DOIM dry-run):
    python manage.py backfill_test_sources
    python manage.py backfill_test_sources --subject akusherlik-va-ginekologiya
    python manage.py backfill_test_sources --limit 1 --apply
    python manage.py backfill_test_sources --apply

    python manage.py backfill_test_sources --force --apply

Xulq:
  * DARSLIK manbasi bor testlar har doim chetlab o'tiladi (idempotent).
  * AI yaratgan TASHQI havolalar (DOI/PubMed) --force bilan darslik manbasiga
    almashtiriladi. Bunday havolalar model tomonidan o'ylab topilgan bo'lishi
    mumkin — tekshiriladigan darslik beti afzal.
  * Darslik topilmagan test CHETLAB O'TILADI — manba soxta biriktirilmaydi va
    --force bilan ham mavjud manba O'CHIRILMAYDI (manbasiz qolib ketmasin).
  * Savol/variant/to'g'ri javob HECH QACHON o'zgarmaydi.
  * Har bir test alohida tranzaksiyada; bittasi yiqilsa qolganlari davom etadi.
"""

from __future__ import annotations

import os

from django.core.management.base import BaseCommand
from django.db import transaction

from core.book_retrieval import (
    book_references_from_chunks,
    format_book_context_message,
    retrieve_book_context,
)
from core.models import PreparedContent
from core.openai_client import OpenAiClientError, generate_openai_text
from core.test_source_backfill import (
    apply_sources_to_payload,
    build_rewrite_prompt,
    external_reference_titles,
    has_book_references,
    parse_rewrite_response,
    payload_has_references,
    payload_questions,
    retrieval_query,
)

LANG_NAMES = {"uz": "Uzbek (lotin)", "ru": "Russian", "en": "English"}


class Command(BaseCommand):
    help = "Testlarga darslik manbasini biriktiradi (izohlarni darslik asosida yangilaydi)."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Haqiqatan saqlash")
        parser.add_argument("--subject", default="", help="Faqat shu subject_code")
        parser.add_argument("--ids", default="", help="Faqat shu id lar: 9,12,13")
        parser.add_argument("--limit", type=int, default=0, help="Nechta test (0 = hammasi)")
        parser.add_argument(
            "--force",
            action="store_true",
            help=(
                "AI yaratgan TASHQI havolalarni (DOI/PubMed) darslik manbasiga "
                "almashtirish. Darslikdan olingan manba baribir tegilmaydi."
            ),
        )
        parser.add_argument(
            "--skip-rewrite",
            action="store_true",
            help="Izohni qayta yozmaslik — faqat manba biriktirish va shablon tozalash",
        )

    def handle(self, *args, **opts):
        apply_changes = bool(opts["apply"])
        api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()

        qs = PreparedContent.objects.filter(kind=PreparedContent.KIND_TEST)
        if opts["subject"]:
            qs = qs.filter(subject_code=opts["subject"])
        if opts["ids"]:
            ids = [int(x) for x in opts["ids"].replace(" ", "").split(",") if x.isdigit()]
            qs = qs.filter(id__in=ids)
        qs = qs.order_by("id")

        rows = list(qs)
        self.stdout.write(
            f"Testlar: {len(rows)}   APPLY={apply_changes}   FORCE={bool(opts['force'])}   "
            f"izoh_qayta_yozish={'yo`q' if opts['skip_rewrite'] else 'ha'}"
        )
        if not api_key:
            self.stdout.write(self.style.WARNING("OPENAI_API_KEY yo'q — izoh qayta yozilmaydi"))

        stats = {"ok": 0, "bor": 0, "tashqi": 0, "kitob_yoq": 0, "xato": 0, "savol_yoq": 0}
        done = 0

        for item in rows:
            if opts["limit"] and done >= opts["limit"]:
                break
            tag = f"#{item.id} [{(item.subject_code or '-')[:24]}] {(item.topic or '')[:34]}"
            payload = item.payload if isinstance(item.payload, dict) else {}
            questions = payload_questions(payload)

            if not questions:
                stats["savol_yoq"] += 1
                self.stdout.write(f"  o'tkazildi (savol yo'q)  {tag}")
                continue
            if payload_has_references(payload):
                # Darslikdan olingan manba — ishonchli, hech qachon almashtirilmaydi.
                if has_book_references(payload):
                    stats["bor"] += 1
                    self.stdout.write(f"  o'tkazildi (darslik manbasi bor) {tag}")
                    continue
                # Tashqi havola (AI o'ylab topgan bo'lishi mumkin) — --force bilan
                # almashtiriladi, aks holda o'tkazib yuboriladi.
                ext = external_reference_titles(payload)
                if not opts["force"]:
                    stats["tashqi"] += 1
                    self.stdout.write(
                        f"  o'tkazildi (tashqi havola, --force kerak) {tag}\n"
                        f"      hozirgi: {'; '.join(ext)[:100]}"
                    )
                    continue
                self.stdout.write(
                    self.style.WARNING(
                        f"  ALMASHTIRILADI (tashqi -> darslik) {tag}\n"
                        f"      eski: {'; '.join(ext)[:100]}"
                    )
                )

            query = retrieval_query(payload)
            chunks = retrieve_book_context(item.subject_code, query) if item.subject_code else []
            refs = book_references_from_chunks(chunks)
            if not refs:
                stats["kitob_yoq"] += 1
                self.stdout.write(
                    self.style.WARNING(f"  o'tkazildi (darslik topilmadi) {tag}")
                )
                continue

            rewrites: dict[int, dict] = {}
            if api_key and not opts["skip_rewrite"]:
                context = format_book_context_message(chunks)
                lang = LANG_NAMES.get(
                    (payload.get("language") or "uz").lower(), LANG_NAMES["uz"]
                )
                try:
                    text = generate_openai_text(
                        api_key,
                        system_instruction=context,
                        user_text=build_rewrite_prompt(questions, lang),
                        json_only=True,
                        max_tokens=6144,
                        temperature=0.3,
                    )
                    rewrites = parse_rewrite_response(text, len(questions))
                except OpenAiClientError as e:
                    stats["xato"] += 1
                    self.stdout.write(self.style.ERROR(f"  AI xato {tag}: {str(e)[:90]}"))
                    continue

            new_payload, touched = apply_sources_to_payload(payload, refs, rewrites)
            books = ", ".join(f"{r['title']} ({r.get('pages', '-')})" for r in refs[:2])
            self.stdout.write(
                f"  YANGILANADI {tag}\n"
                f"      savol={len(questions)} manba_biriktirildi={touched} "
                f"izoh_yangilandi={len(rewrites)}\n"
                f"      {books[:110]}"
            )

            if apply_changes:
                try:
                    with transaction.atomic():
                        item.payload = new_payload
                        item.save(update_fields=["payload"])
                except Exception as e:  # noqa: BLE001 — bitta test yiqilsa qolganlari davom etadi
                    stats["xato"] += 1
                    self.stdout.write(self.style.ERROR(f"  saqlash xatosi {tag}: {str(e)[:90]}"))
                    continue
            stats["ok"] += 1
            done += 1

        self.stdout.write("")
        self.stdout.write(
            "NATIJA: yangilandi=%d  darslik_manbasi_bor=%d  tashqi_havola_o'tkazildi=%d  "
            "darslik_yo'q=%d  savol_yo'q=%d  xato=%d"
            % (stats["ok"], stats["bor"], stats["tashqi"], stats["kitob_yoq"],
               stats["savol_yoq"], stats["xato"])
        )
        if not apply_changes and stats["ok"]:
            self.stdout.write(self.style.WARNING("Bu DRY-RUN edi — saqlash uchun --apply qo'shing"))
        if stats["tashqi"]:
            self.stdout.write(
                self.style.WARNING(
                    "%d testda AI yaratgan tashqi havola bor (tekshirib bo'lmaydi). "
                    "Darslik manbasiga almashtirish uchun: --force" % stats["tashqi"]
                )
            )
