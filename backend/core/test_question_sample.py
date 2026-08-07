"""Unique questions sample (pool + dedupe + shuffle) unit tests."""

from __future__ import annotations

import random
from types import SimpleNamespace
from unittest import TestCase

from core.content_catalog_service import (
    collect_unique_questions_from_tests,
    normalize_question_text_key,
)


def _item(pk: int, questions: list, *, references=None, translations=None) -> SimpleNamespace:
    payload = {'questions': questions, 'primaryLanguage': 'uz'}
    if references is not None:
        payload['references'] = references
    if translations is not None:
        payload['translations'] = translations
    return SimpleNamespace(pk=pk, payload=payload)


def _uz_text(q: dict) -> str:
    return q['languages']['uz']['question']


class CollectUniqueQuestionsTests(TestCase):
    def test_normalize_key(self):
        self.assertEqual(
            normalize_question_text_key('  Hello   WORLD '),
            'hello world',
        )

    def test_dedupes_across_tests_and_keeps_payload_refs(self):
        items = [
            _item(
                1,
                [
                    {
                        'question': 'Savol A',
                        'options': ['1', '2'],
                        'correctOptionIndex': 0,
                        'references': [{'title': 'Kitob A', 'pages': '10'}],
                    },
                    {
                        'question': 'Savol B',
                        'options': ['1', '2'],
                        'correctOptionIndex': 1,
                    },
                ],
                references=[{'title': 'Payload Kitob', 'pages': '99'}],
                translations={
                    'ru': {
                        'questions': [
                            {'question': 'Вопрос A', 'options': ['1', '2'], 'explanation': ''},
                            {'question': 'Вопрос B', 'options': ['1', '2'], 'explanation': ''},
                        ]
                    },
                    'en': {
                        'questions': [
                            {'question': 'Question A', 'options': ['1', '2'], 'explanation': ''},
                            {'question': 'Question B', 'options': ['1', '2'], 'explanation': ''},
                        ]
                    },
                },
            ),
            _item(
                2,
                [
                    {
                        'question': '  savol   a ',
                        'options': ['x', 'y'],
                        'correctOptionIndex': 0,
                    },
                    {
                        'question': 'Savol C',
                        'options': ['1', '2'],
                        'correctOptionIndex': 0,
                    },
                ],
            ),
        ]
        qs, available, scanned = collect_unique_questions_from_tests(
            items,
            shuffle=False,
            count=None,
        )
        self.assertEqual(scanned, 2)
        self.assertEqual(available, 3)
        self.assertEqual(len(qs), 3)
        texts = [_uz_text(q) for q in qs]
        self.assertEqual(texts[0], 'Savol A')
        self.assertEqual(qs[0]['languages']['ru']['question'], 'Вопрос A')
        self.assertEqual(qs[0]['languages']['en']['question'], 'Question A')
        self.assertEqual(qs[0]['references'][0]['title'], 'Kitob A')
        self.assertEqual(qs[1]['references'][0]['title'], 'Payload Kitob')
        self.assertEqual(qs[1]['source_test_id'], 1)
        self.assertEqual(_uz_text(qs[2]), 'Savol C')
        self.assertEqual(qs[2]['source_test_id'], 2)

    def test_count_and_shuffle(self):
        items = [
            _item(
                1,
                [
                    {'question': f'Q{i}', 'options': ['a', 'b'], 'correctOptionIndex': 0}
                    for i in range(5)
                ],
            )
        ]
        rng = random.Random(42)
        qs, available, _ = collect_unique_questions_from_tests(
            items,
            shuffle=True,
            count=3,
            rng=rng,
        )
        self.assertEqual(available, 5)
        self.assertEqual(len(qs), 3)
        self.assertNotEqual([_uz_text(q) for q in qs], ['Q0', 'Q1', 'Q2'])
