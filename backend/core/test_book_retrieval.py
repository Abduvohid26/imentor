from __future__ import annotations

import unittest
from unittest.mock import patch

from django.db import connection
from django.test import TestCase, override_settings

from core.book_retrieval import format_book_context_message, retrieve_book_context
from core.models import AcademicDepartment, BookChunk, CourseSyllabus, SubjectBook

# CosineDistance (pgvector) faqat PostgreSQL'da ishlaydi; dev test runner sqlite ishlatadi.
requires_postgres = unittest.skipUnless(
    connection.vendor == "postgresql", "pgvector CosineDistance PostgreSQL talab qiladi"
)


@requires_postgres
@override_settings()
class BookRetrievalTests(TestCase):
    def setUp(self):
        self.dept = AcademicDepartment.objects.create(name="Fiziologiya", code="fiziologiya")
        self.syllabus = CourseSyllabus.objects.create(
            subject_name="Normal fiziologiya",
            subject_code="fiziologiya__normal-fiziologiya",
            department=self.dept,
        )
        self.book = SubjectBook.objects.create(
            department=self.dept, title="Guyton", source_archive="3. Fiziologiya.7z"
        )
        BookChunk.objects.create(
            book=self.book,
            department=self.dept,
            chunk_index=0,
            page_start=114,
            page_end=114,
            text="Cardiac cycle: systole and diastole phases.",
            embedding=[1.0] + [0.0] * 1535,
        )
        BookChunk.objects.create(
            book=self.book,
            department=self.dept,
            chunk_index=1,
            page_start=200,
            page_end=201,
            text="Unrelated chunk about hearing and equilibrium.",
            embedding=[0.0, 1.0] + [0.0] * 1534,
        )

    @patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"})
    @patch("core.book_retrieval.create_embeddings")
    def test_retrieve_returns_closest_chunk_first(self, mock_embed):
        mock_embed.return_value = [[1.0] + [0.0] * 1535]
        results = retrieve_book_context("fiziologiya__normal-fiziologiya", "cardiac cycle", top_k=2)
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["book_title"], "Guyton")
        self.assertEqual(results[0]["page"], "114")
        self.assertIn("systole", results[0]["text"])

    def test_retrieve_returns_empty_without_api_key(self):
        with patch.dict("os.environ", {}, clear=True):
            results = retrieve_book_context("fiziologiya__normal-fiziologiya", "cardiac cycle")
        self.assertEqual(results, [])

    def test_retrieve_returns_empty_for_unknown_subject(self):
        with patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}):
            results = retrieve_book_context("unknown__subject", "cardiac cycle")
        self.assertEqual(results, [])

    def test_retrieve_returns_empty_without_query_or_subject(self):
        self.assertEqual(retrieve_book_context("", "cardiac cycle"), [])
        self.assertEqual(retrieve_book_context("fiziologiya__normal-fiziologiya", ""), [])

    def test_format_book_context_message_empty(self):
        self.assertIsNone(format_book_context_message([]))

    def test_format_book_context_message_includes_citation_instruction(self):
        msg = format_book_context_message(
            [{"book_title": "Guyton", "page": "114", "text": "Cardiac cycle."}]
        )
        self.assertIn("Manba:", msg)
        self.assertIn("Guyton", msg)
        self.assertIn("114-bet", msg)
