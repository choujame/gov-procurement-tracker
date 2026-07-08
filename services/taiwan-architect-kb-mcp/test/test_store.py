import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from store import KnowledgeBaseStore  # noqa: E402


class TestKnowledgeBaseStore(unittest.TestCase):
    def setUp(self):
        self.store = KnowledgeBaseStore()

    def test_loads_seed_entries(self):
        self.assertGreater(len(self.store.all()), 0)

    def test_get_known_entry(self):
        entry = self.store.get("tw-building-act")
        self.assertIsNotNone(entry)
        self.assertEqual(entry.category, "statute")

    def test_get_unknown_entry_returns_none(self):
        self.assertIsNone(self.store.get("does-not-exist"))

    def test_search_by_title_keyword(self):
        results = self.store.search("消防")
        ids = [e.id for e in results]
        self.assertIn("tw-fire-services-act", ids)

    def test_search_respects_category_filter(self):
        results = self.store.search("建築", category="regulation")
        self.assertTrue(all(e.category == "regulation" for e in results))

    def test_search_no_match_returns_empty(self):
        self.assertEqual(self.store.search("完全不相關的詞彙xyz"), [])


if __name__ == "__main__":
    unittest.main()
