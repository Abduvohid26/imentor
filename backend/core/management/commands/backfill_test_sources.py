"""Mavjud testlarga darslik manbasini biriktiradi va izohlarni yangilaydi.

Ishlatish (avval DOIM dry-run):
    python manage.py backfill_test_sources
    python manage.py backfill_test_sources --subject akusherlik-va-ginekologiya
    python manage.py backfill_test_sources --limit 1 --apply
    python manage.py backfill_test_sources --apply

    # Bir xil manbani qayta: har savolga o'z RAG manbasi
    python manage.py backfill_test_sources --ids 24 --refresh --per-question --apply

    python manage.py backfill_test_sources --force --apply

Xulq:
  * DARSLIK manbasi bor testlar odatda chetlab o'tiladi (idempotent).
  * --refresh: mavjud darslik manbasini ham HAR SAVOL uchun qayta RAG qiladi.
  * --per-question (default): har savol matni bo'yicha alohida retrieval.
  * --no-per-question: eski usul — bitta umumiy manba barcha savollarga.
  * AI yaratgan TASHQI havolalar (DOI/PubMed) --force bilan darslik manbasiga
    almashtiriladi.
  * Darslik topilmagan test CHETLAB O'TILADI.
  * Savol/variant/to'g'ri javob HECH QACHON o'zgarmaydi.
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
    apply_per_question_sources_to_payload,
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
                "almashtirish. Darslikdan olingan manba baribir tegilmaydi "
                "(--refresh bo'lmasa)."
            ),
        )
        parser.add_argument(
            "--refresh",
            action="store_true",
            help=(
                "Mavjud darslik manbasini ham qayta yozish — har savol uchun "
                "yangi RAG (bir xil Oxford stampini tozalash uchun)."
            ),
        )
        parser.add_argument(
            "--per-question",
            action="store_true",
            default=True,
            help="Har savol matni bo'yicha alohida manba (default)",
        )
        parser.add_argument(
            "--no-per-question",
            action="store_false",
            dest="per_question",
            help="Bitta umumiy manbani barcha savollarga yopishtirish (eski)",
        )
        parser.add_argument(
            "--skip-rewrite",
            action="store_true",
            help="Izohni qayta yozmaslik — faqat manba biriktirish va shablon tozalash",
        )

    def handle(self, *args, **opts):
        apply_changes = bool(opts["apply"])
        per_question = bool(opts["per_question"])
        refresh = bool(opts["refresh"])
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
            f"REFRESH={refresh}   PER_Q={per_question}   "
            f"izoh_qayta_yozish={'yo`q' if opts['skip_rewrite'] else 'ha'}"
        )
        if not api_key:
            self.stdout.write(self.style.WARNING("OPENAI_API_KEY yo'q — izoh qayta yozilmaydi / RAG yo'q"))

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
            if payload_has_references(payload) and not refresh:
                if has_book_references(payload):
                    stats["bor"] += 1
                    self.stdout.write(f"  o'tkazildi (darslik manbasi bor) {tag}")
                    continue
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
            elif refresh and has_book_references(payload):
                self.stdout.write(self.style.WARNING(f"  YANGILANADI (refresh) {tag}"))

            if not item.subject_code:
                stats["kitob_yoq"] += 1
                self.stdout.write(self.style.WARNING(f"  o'tkazildi (subject_code yo'q) {tag}"))
                continue

            # Izoh rewrite uchun umumiy context (topic + bir necha savol).
            shared_query = retrieval_query(payload)
            self.stdout.write(f"      … RAG (umumiy kontekst) {tag}")
            shared_chunks = (
                retrieve_book_context(item.subject_code, shared_query, top_k=12)
                if shared_query
                else []
            )
            if per_question:
                per_refs = []
                total_q = len(questions)
                for qi, q in enumerate(questions, start=1):
                    if qi == 1 or qi == total_q or qi % 5 == 0:
                        self.stdout.write(f"      … RAG per-savol {qi}/{total_q}")
                    qtext = str(q.get("question") or "").strip()
                    q_chunks = (
                        retrieve_book_context(item.subject_code, qtext[:2000], top_k=3)
                        if qtext
                        else []
                    )
                    per_refs.append(book_references_from_chunks(q_chunks))
                # Hech qaysi savolda manba chiqmasa — fallback shared
                if not any(per_refs):
                    shared_refs = book_references_from_chunks(shared_chunks)
                    if not shared_refs:
                        stats["kitob_yoq"] += 1
                        self.stdout.write(
                            self.style.WARNING(f"  o'tkazildi (darslik topilmadi) {tag}")
                        )
                        continue
                    per_refs = [list(shared_refs) for _ in questions]
            else:
                shared_refs = book_references_from_chunks(shared_chunks)
                if not shared_refs:
                    stats["kitob_yoq"] += 1
                    self.stdout.write(
                        self.style.WARNING(f"  o'tkazildi (darslik topilmadi) {tag}")
                    )
                    continue
                per_refs = [list(shared_refs) for _ in questions]

            rewrites: dict[int, dict] = {}
            if api_key and not opts["skip_rewrite"] and shared_chunks:
                context = format_book_context_message(shared_chunks)
                lang = LANG_NAMES.get(
                    (payload.get("language") or "uz").lower(), LANG_NAMES["uz"]
                )
                # Katta bir so'rov o'rniga 3 tadan — timeout/qotish kamayadi.
                batch_size = 3
                try:
                    for start in range(0, len(questions), batch_size):
                        batch = questions[start : start + batch_size]
                        self.stdout.write(
                            f"      … AI izoh qayta yozish "
                            f"{start + 1}–{start + len(batch)}/{len(questions)} "
                            f"(1–3 daqiqa kutishi mumkin)"
                        )
                        text = generate_openai_text(
                            api_key,
                            system_instruction=context,
                            user_text=build_rewrite_prompt(batch, lang),
                            json_only=True,
                            max_tokens=8192,
                            temperature=0.25,
                        )
                        parsed = parse_rewrite_response(text, len(batch))
                        for local_i, row in parsed.items():
                            rewrites[start + local_i] = row
                except OpenAiClientError as e:
                    stats["xato"] += 1
                    self.stdout.write(self.style.ERROR(f"  AI xato {tag}: {str(e)[:90]}"))
                    continue

            if per_question:
                new_payload, touched = apply_per_question_sources_to_payload(
                    payload, per_refs, rewrites
                )
            else:
                new_payload, touched = apply_sources_to_payload(
                    payload, per_refs[0] if per_refs else [], rewrites
                )

            sample_titles = []
            for refs in per_refs[:3]:
                for r in refs[:1]:
                    sample_titles.append(f"{r.get('title')} ({r.get('pages', '-')})")
            books = " | ".join(sample_titles) if sample_titles else "-"
            distinct = len({
                (r.get("title"), r.get("pages"))
                for refs in per_refs
                for r in refs
                if r.get("title")
            })
            self.stdout.write(
                f"  YANGILANADI {tag}\n"
                f"      savol={len(questions)} manba_biriktirildi={touched} "
                f"unique_manba={distinct} izoh_yangilandi={len(rewrites)}\n"
                f"      {books[:140]}"
            )

            if apply_changes:
                try:
                    with transaction.atomic():
                        item.payload = new_payload
                        item.save(update_fields=["payload"])
                except Exception as e:  # noqa: BLE001
                    stats["xato"] += 1
                    self.stdout.write(self.style.ERROR(f"  saqlash xatosi {tag}: {str(e)[:90]}"))
                    continue
            stats["ok"] += 1
            done += 1

        self.stdout.write("")
        self.stdout.write(
            f"NATIJA: yangilandi={stats['ok']}  darslik_manbasi_bor={stats['bor']}  "
            f"tashqi_havola_o'tkazildi={stats['tashqi']}  darslik_yo'q={stats['kitob_yoq']}  "
            f"savol_yo'q={stats['savol_yoq']}  xato={stats['xato']}"
        )
        if not apply_changes and stats["ok"]:
            self.stdout.write(
                self.style.WARNING("Bu DRY-RUN edi — saqlash uchun --apply qo'shing")
            )
