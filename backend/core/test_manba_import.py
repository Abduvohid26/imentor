"""Import manba catalog command tests."""

from django.test import TestCase

from core.syllabus_topic_parse import extract_topics_by_regex


class ManbaCatalogParseTests(TestCase):
    def test_extract_inline_topics(self):
        text = """
        Ma'ruzalar
        M1 - Yurak anatomiyasi asoslari
        M2 - Qon aylanish tizimi
        Amaliy mashg'ulotlar
        A1 - EKG o'qish
        """
        topics = extract_topics_by_regex(text)
        ids = [t["id"] for t in topics]
        self.assertIn("M1", ids)
        self.assertIn("M2", ids)
        self.assertIn("A1", ids)

    def test_parse_fan_name_and_variant_helpers(self):
        from core.manba_catalog_utils import parse_fan_name, parse_variant_label

        self.assertEqual(parse_fan_name("Normal fiziologiya (PI).pdf"), "Normal fiziologiya")
        self.assertEqual(parse_variant_label("Normal fiziologiya (PI).pdf"), "PI")
        self.assertEqual(parse_variant_label("Dinshunoslik (DI).pdf"), "DI")
