import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from textrank import extract_keywords  # noqa: E402


class TestExtractKeywords(unittest.TestCase):
    def test_empty_text_returns_no_keywords(self):
        self.assertEqual(extract_keywords(""), [])

    def test_non_chinese_text_returns_no_keywords(self):
        self.assertEqual(extract_keywords("hello world 123"), [])

    def test_extracts_repeated_terms_as_top_keyword(self):
        text = "建築物安全建築物安全建築物安全消防設備一次"
        keywords = extract_keywords(text, top_k=3)
        self.assertTrue(len(keywords) > 0)
        terms = [k.term for k in keywords]
        # merged phrases may absorb "建築物" into a longer repeated span
        self.assertTrue(any("建築物" in term for term in terms))

    def test_respects_top_k(self):
        text = "建築技術規則建築設計施工編構造編設備編無障礙設施消防安全設備政府採購法招標決標公告"
        keywords = extract_keywords(text, top_k=3)
        self.assertLessEqual(len(keywords), 3)

    def test_scores_are_sorted_descending(self):
        text = "建築技術規則建築設計施工編構造編設備編無障礙設施消防安全設備政府採購法招標決標公告"
        keywords = extract_keywords(text, top_k=10)
        scores = [k.score for k in keywords]
        self.assertEqual(scores, sorted(scores, reverse=True))


if __name__ == "__main__":
    unittest.main()
