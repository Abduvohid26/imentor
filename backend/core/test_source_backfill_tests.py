"""backfill_test_sources buyrug'i va uning sof mantiqi testlari."""

from __future__ import annotations

from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import TestCase

from core.models import PreparedContent
from core.test_source_backfill import (
    apply_sources_to_payload,
    external_reference_titles,
    has_book_references,
    parse_rewrite_response,
    payload_has_references,
    retrieval_query,
    strip_unfilled_source,
)

REFS = [{"title": "Williams obstetrics 26th edition", "pages": "643"}]


def sample_payload() -> dict:
    return {
        "topic": "Homiladorlikda qusish",
        "questions": [
            {
                "question": "Qaysi dori birinchi tanlov?",
                "options": ["Dimenhidrinat", "Vitamin B6", "Prometazin"],
                "correctOptionIndex": 1,
                "explanation": "B6 birinchi tanlov (Manba: kitob nomi, sahifa-bet).",
                "optionExplanations": [
                    "Birinchi tanlov emas (Manba: kitob nomi, sahifa-bet).",
                    "To'g'ri.",
                    "Ehtiyotkorlik bilan.",
                ],
            }
        ],
        "translations": {
            "en": {
                "questions": [
                    {
                        "question": "Which drug is first line?",
                        "options": ["A", "B", "C"],
                        "correctOptionIndex": 1,
                        "explanation": "B6 is first line (Source: book name, page).",
                    }
                ]
            }
        },
    }


class StripUnfilledSourceTests(TestCase):
    def test_removes_placeholder_keeps_real_source(self):
        self.assertEqual(
            strip_unfilled_source("B6 birinchi tanlov (Manba: kitob nomi, sahifa-bet)."),
            "B6 birinchi tanlov.",
        )
        real = "B6 birinchi tanlov (Manba: Williams obstetrics, 643-bet)."
        self.assertEqual(strip_unfilled_source(real), real)

    def test_handles_other_languages_and_empty(self):
        self.assertEqual(strip_unfilled_source("Text (Source: book name, page)."), "Text.")
        self.assertEqual(strip_unfilled_source("Текст (Источник: название книги, стр)."), "Текст.")
        self.assertEqual(strip_unfilled_source(None), "")


class PayloadHelpersTests(TestCase):
    def test_has_references_detection(self):
        self.assertFalse(payload_has_references(sample_payload()))
        p, _ = apply_sources_to_payload(sample_payload(), REFS)
        self.assertTrue(payload_has_references(p))

    def test_per_question_refs_differ(self):
        from core.test_source_backfill import apply_per_question_sources_to_payload

        payload = sample_payload()
        payload["questions"].append(
            {
                "question": "Ikkinchi savol?",
                "options": ["A", "B", "C"],
                "correctOptionIndex": 0,
                "explanation": "Izoh",
            }
        )
        per = [
            [{"title": "Kitob A", "pages": "10"}],
            [{"title": "Kitob B", "pages": "20-22"}],
        ]
        out, touched = apply_per_question_sources_to_payload(payload, per)
        self.assertEqual(touched, 2)
        self.assertEqual(out["questions"][0]["references"][0]["title"], "Kitob A")
        self.assertEqual(out["questions"][1]["references"][0]["title"], "Kitob B")
        titles = {r["title"] for r in out["references"]}
        self.assertEqual(titles, {"Kitob A", "Kitob B"})

    def test_retrieval_query_includes_topic_and_questions(self):
        q = retrieval_query(sample_payload())
        self.assertIn("Homiladorlikda qusish", q)
        self.assertIn("birinchi tanlov", q)

    def test_rewrite_prompt_asks_for_detailed_explanations(self):
        from core.test_source_backfill import build_rewrite_prompt

        prompt = build_rewrite_prompt(sample_payload()["questions"], "Uzbek (lotin)")
        self.assertIn("8–12", prompt)
        self.assertIn("2–3", prompt)
        self.assertIn("YO'Q fakt", prompt)

    def test_parse_rewrite_response_handles_fences_and_bad_index(self):
        text = '```json\n[{"i":0,"explanation":"Yangi izoh","optionExplanations":["a","b","c"]},' \
               '{"i":99,"explanation":"chegaradan tashqari"}]\n```'
        out = parse_rewrite_response(text, expected=1)
        self.assertEqual(set(out), {0})
        self.assertEqual(out[0]["explanation"], "Yangi izoh")

    def test_parse_rewrite_response_survives_garbage(self):
        self.assertEqual(parse_rewrite_response("not json at all", 3), {})
        self.assertEqual(parse_rewrite_response("", 3), {})


class ApplySourcesTests(TestCase):
    def test_questions_and_answers_never_change(self):
        original = sample_payload()
        new, touched = apply_sources_to_payload(original, REFS, {0: {"explanation": "Darslikdan"}})
        self.assertEqual(touched, 1)
        oq, nq = original["questions"][0], new["questions"][0]
        self.assertEqual(nq["question"], oq["question"])
        self.assertEqual(nq["options"], oq["options"])
        self.assertEqual(nq["correctOptionIndex"], oq["correctOptionIndex"])

    def test_attaches_references_and_rewrites_explanation(self):
        new, _ = apply_sources_to_payload(
            sample_payload(), REFS,
            {0: {"explanation": "Darslikka asoslangan izoh",
                 "optionExplanations": ["x", "y", "z"]}},
        )
        q = new["questions"][0]
        self.assertEqual(q["references"], REFS)
        self.assertEqual(q["explanation"], "Darslikka asoslangan izoh")
        self.assertEqual(q["optionExplanations"], ["x", "y", "z"])
        self.assertEqual(new["references"], REFS)

    def test_without_rewrite_only_strips_placeholder(self):
        new, _ = apply_sources_to_payload(sample_payload(), REFS)
        q = new["questions"][0]
        self.assertEqual(q["explanation"], "B6 birinchi tanlov.")
        self.assertEqual(q["optionExplanations"][0], "Birinchi tanlov emas.")
        self.assertEqual(q["references"], REFS)

    def test_translations_get_references_and_cleanup(self):
        new, _ = apply_sources_to_payload(sample_payload(), REFS, {0: {"explanation": "Yangi"}})
        tr = new["translations"]["en"]["questions"][0]
        self.assertEqual(tr["references"], REFS)
        self.assertEqual(tr["explanation"], "B6 is first line.", "shablon tozalansin")
        self.assertNotEqual(tr["explanation"], "Yangi", "tarjima izohi qayta yozilmasin")

    def test_original_payload_not_mutated(self):
        original = sample_payload()
        apply_sources_to_payload(original, REFS, {0: {"explanation": "Yangi"}})
        self.assertIn("Manba: kitob nomi", original["questions"][0]["explanation"])
        self.assertNotIn("references", original["questions"][0])

    def test_no_references_means_no_attach(self):
        new, touched = apply_sources_to_payload(sample_payload(), [])
        self.assertEqual(touched, 0)
        self.assertNotIn("references", new["questions"][0])


class BackfillCommandTests(TestCase):
    """Buyruq oqimi — AI va RAG mock qilinadi (haqiqiy chaqiruv yo'q)."""

    def _make(self, **kw) -> PreparedContent:
        defaults = dict(
            owner_key="staff1",
            kind=PreparedContent.KIND_TEST,
            topic="Homiladorlikda qusish",
            topic_norm="homiladorlikda qusish",
            subject_code="akusherlik-va-ginekologiya",
            payload=sample_payload(),
        )
        defaults.update(kw)
        return PreparedContent.objects.create(**defaults)

    def _run(self, chunks, ai_text='[{"i":0,"explanation":"Darslikdan izoh"}]', **opts):
        out = StringIO()
        from core.book_retrieval import book_references_from_chunks

        refs = book_references_from_chunks(chunks)

        def _per_q_refs(subject_code, queries, **kwargs):
            return [list(refs) for _ in queries] if refs else [[] for _ in queries]

        with (
            mock.patch(
                "core.management.commands.backfill_test_sources.resolve_book_department_id",
                return_value=1,
            ),
            mock.patch(
                "core.management.commands.backfill_test_sources.retrieve_book_context",
                return_value=chunks,
            ),
            mock.patch(
                "core.management.commands.backfill_test_sources.retrieve_references_for_queries",
                side_effect=_per_q_refs,
            ),
            mock.patch(
                "core.management.commands.backfill_test_sources.generate_openai_text",
                return_value=ai_text,
            ) as gen,
            mock.patch.dict("os.environ", {"OPENAI_API_KEY": "sk-test"}),
        ):
            call_command("backfill_test_sources", stdout=out, **opts)
        return out.getvalue(), gen

    def test_dry_run_does_not_save(self):
        item = self._make()
        text, _ = self._run([{"book_title": "1. Williams-obstetrics-26th-pdf", "page": "643", "text": "B6 haqida matn"}])
        self.assertIn("YANGILANADI", text)
        self.assertIn("DRY-RUN", text)
        item.refresh_from_db()
        self.assertFalse(payload_has_references(item.payload))

    def test_apply_saves_references_and_clean_title(self):
        item = self._make()
        text, _ = self._run(
            [{"book_title": "1. Williams-obstetrics-26th-edition-pdf", "page": "643", "text": "B6 haqida matn"}],
            apply=True,
        )
        item.refresh_from_db()
        refs = item.payload["questions"][0]["references"]
        self.assertEqual(refs[0]["title"], "Williams obstetrics 26th edition")
        self.assertEqual(refs[0]["pages"], "643")
        self.assertEqual(item.payload["questions"][0]["explanation"], "Darslikdan izoh")
        self.assertIn("yangilandi=1", text)

    def test_skips_when_no_book_found(self):
        item = self._make()
        text, gen = self._run([], apply=True)
        gen.assert_not_called()
        item.refresh_from_db()
        self.assertFalse(payload_has_references(item.payload), "manba SOXTA biriktirilmasin")
        self.assertIn("darslik topilmadi", text.lower())

    def test_idempotent_second_run_skips(self):
        self._make()
        chunks = [{"book_title": "Williams obstetrics", "page": "643", "text": "B6 haqida matn"}]
        self._run(chunks, apply=True)
        text, gen = self._run(chunks, apply=True)
        gen.assert_not_called()
        self.assertIn("darslik manbasi bor", text)

    def test_skip_rewrite_does_not_call_ai(self):
        item = self._make()
        _, gen = self._run(
            [{"book_title": "Williams obstetrics", "page": "643", "text": "B6 haqida matn"}],
            apply=True, skip_rewrite=True,
        )
        gen.assert_not_called()
        item.refresh_from_db()
        self.assertTrue(payload_has_references(item.payload))
        self.assertEqual(item.payload["questions"][0]["explanation"], "B6 birinchi tanlov.")

    def test_subject_and_limit_filters(self):
        self._make()
        self._make(subject_code="boshqa-fan")
        text, _ = self._run(
            [{"book_title": "Williams obstetrics", "page": "643", "text": "B6 haqida matn"}],
            subject="boshqa-fan",
        )
        self.assertIn("Testlar: 1", text)

    def test_ai_failure_leaves_payload_untouched(self):
        item = self._make()
        out = StringIO()
        from core.openai_client import OpenAiClientError

        chunks = [{"book_title": "Williams obstetrics", "page": "643", "text": "B6 haqida matn"}]
        refs = [{"title": "Williams obstetrics", "pages": "643"}]
        with (
            mock.patch(
                "core.management.commands.backfill_test_sources.resolve_book_department_id",
                return_value=1,
            ),
            mock.patch(
                "core.management.commands.backfill_test_sources.retrieve_book_context",
                return_value=chunks,
            ),
            mock.patch(
                "core.management.commands.backfill_test_sources.retrieve_references_for_queries",
                side_effect=lambda *_a, **_k: [list(refs)],
            ),
            mock.patch(
                "core.management.commands.backfill_test_sources.generate_openai_text",
                side_effect=OpenAiClientError("rate limited"),
            ),
            mock.patch.dict("os.environ", {"OPENAI_API_KEY": "sk-test"}),
        ):
            call_command("backfill_test_sources", apply=True, stdout=out)
        item.refresh_from_db()
        self.assertFalse(payload_has_references(item.payload))
        self.assertIn("xato=1", out.getvalue())

    def test_other_kinds_are_not_touched(self):
        lecture = self._make(kind=PreparedContent.KIND_LECTURE)
        self._run([{"book_title": "Williams obstetrics", "page": "643", "text": "B6 haqida matn"}], apply=True)
        lecture.refresh_from_db()
        self.assertFalse(payload_has_references(lecture.payload))


EXTERNAL_REFS = [
    {
        "title": "Nausea and vomiting of pregnancy",
        "url": "https://pubmed.ncbi.nlm.nih.gov/29420409/",
        "publisher": "BMJ",
        "year": "2020",
    }
]
BOOK_REFS = [{"title": "Williams obstetrics", "pages": "643"}]


def payload_with_refs(refs) -> dict:
    p = sample_payload()
    p["questions"][0]["references"] = [dict(r) for r in refs]
    return p


class ReferenceClassificationTests(TestCase):
    """Darslik manbasi (ishonchli) va AI havolasi (tekshirilmaydi) farqi."""

    def test_book_refs_detected(self):
        self.assertTrue(has_book_references(payload_with_refs(BOOK_REFS)))
        self.assertFalse(has_book_references(payload_with_refs(EXTERNAL_REFS)))
        self.assertFalse(has_book_references(sample_payload()))

    def test_external_titles_listed(self):
        titles = external_reference_titles(payload_with_refs(EXTERNAL_REFS))
        self.assertEqual(titles, ["Nausea and vomiting of pregnancy"])
        self.assertEqual(external_reference_titles(payload_with_refs(BOOK_REFS)), [])


class ForceReplaceTests(TestCase):
    """--force: AI havolalarini darslik manbasiga almashtirish."""

    CHUNKS = [{"book_title": "Williams obstetrics", "page": "643", "text": "matn"}]

    def _make(self, refs, **kw) -> PreparedContent:
        return PreparedContent.objects.create(
            owner_key="staff1",
            kind=PreparedContent.KIND_TEST,
            topic="Homiladorlikda qusish",
            topic_norm="homiladorlikda qusish",
            subject_code="akusherlik-va-ginekologiya",
            payload=payload_with_refs(refs),
            **kw,
        )

    def _run(self, chunks, **opts):
        out = StringIO()
        from core.book_retrieval import book_references_from_chunks

        refs = book_references_from_chunks(chunks)

        def _per_q_refs(subject_code, queries, **kwargs):
            return [list(refs) for _ in queries] if refs else [[] for _ in queries]

        with (
            mock.patch(
                "core.management.commands.backfill_test_sources.resolve_book_department_id",
                return_value=1,
            ),
            mock.patch(
                "core.management.commands.backfill_test_sources.retrieve_book_context",
                return_value=chunks,
            ),
            mock.patch(
                "core.management.commands.backfill_test_sources.retrieve_references_for_queries",
                side_effect=_per_q_refs,
            ),
            mock.patch(
                "core.management.commands.backfill_test_sources.generate_openai_text",
                return_value='[{"i":0,"explanation":"Darslikdan"}]',
            ) as gen,
            mock.patch.dict("os.environ", {"OPENAI_API_KEY": "sk-test"}),
        ):
            call_command("backfill_test_sources", stdout=out, **opts)
        return out.getvalue(), gen

    def test_without_force_external_refs_kept(self):
        item = self._make(EXTERNAL_REFS)
        text, gen = self._run(self.CHUNKS, apply=True)
        gen.assert_not_called()
        item.refresh_from_db()
        self.assertEqual(item.payload["questions"][0]["references"], EXTERNAL_REFS)
        self.assertIn("--force kerak", text)
        self.assertIn("tashqi_havola_o'tkazildi=1", text)

    def test_force_replaces_external_with_book(self):
        item = self._make(EXTERNAL_REFS)
        text, _ = self._run(self.CHUNKS, apply=True, force=True)
        item.refresh_from_db()
        refs = item.payload["questions"][0]["references"]
        self.assertEqual(refs, BOOK_REFS, "tashqi havola darslik manbasiga almashsin")
        self.assertNotIn("pubmed", str(refs).lower())
        self.assertIn("ALMASHTIRILADI", text)

    def test_force_does_NOT_delete_refs_when_no_book_found(self):
        """Eng muhim xavfsizlik: darslik topilmasa eski manba SAQLANADI."""
        item = self._make(EXTERNAL_REFS)
        text, _ = self._run([], apply=True, force=True)
        item.refresh_from_db()
        self.assertEqual(
            item.payload["questions"][0]["references"], EXTERNAL_REFS,
            "manbasiz qoldirib ketmasin",
        )
        self.assertIn("darslik topilmadi", text.lower())

    def test_force_never_touches_book_references(self):
        item = self._make(BOOK_REFS)
        text, gen = self._run(
            [{"book_title": "Boshqa kitob", "page": "10", "text": "matn"}],
            apply=True, force=True,
        )
        gen.assert_not_called()
        item.refresh_from_db()
        self.assertEqual(item.payload["questions"][0]["references"], BOOK_REFS)
        self.assertIn("darslik manbasi bor", text)

    def test_force_is_idempotent(self):
        item = self._make(EXTERNAL_REFS)
        self._run(self.CHUNKS, apply=True, force=True)
        text, gen = self._run(self.CHUNKS, apply=True, force=True)
        gen.assert_not_called()
        self.assertIn("darslik manbasi bor", text)
        item.refresh_from_db()
        self.assertEqual(item.payload["questions"][0]["references"], BOOK_REFS)
