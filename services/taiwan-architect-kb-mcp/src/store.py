"""JSON-file-backed knowledge base store, stdlib-only."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "building_codes.json"


@dataclass(frozen=True)
class KbEntry:
    id: str
    category: str
    title: str
    summary: str
    full_text: str
    status: str
    source_url: str
    tags: list[str] = field(default_factory=list)

    def searchable_text(self) -> str:
        return " ".join([self.title, self.summary, self.full_text, " ".join(self.tags)])


class KnowledgeBaseStore:
    def __init__(self, data_path: Path | None = None):
        self._data_path = data_path or DEFAULT_DATA_PATH
        self._entries: dict[str, KbEntry] = {}
        self._load()

    def _load(self) -> None:
        raw = json.loads(self._data_path.read_text(encoding="utf-8"))
        for item in raw.get("entries", []):
            entry = KbEntry(
                id=item["id"],
                category=item.get("category", ""),
                title=item.get("title", ""),
                summary=item.get("summary", ""),
                full_text=item.get("full_text", ""),
                status=item.get("status", ""),
                source_url=item.get("source_url", ""),
                tags=list(item.get("tags", [])),
            )
            self._entries[entry.id] = entry

    def get(self, entry_id: str) -> KbEntry | None:
        return self._entries.get(entry_id)

    def all(self) -> list[KbEntry]:
        return list(self._entries.values())

    def search(self, query: str, category: str | None = None) -> list[KbEntry]:
        """Naive substring/keyword search over title, summary, full_text, tags."""
        terms = [t for t in query.replace("　", " ").split() if t] or [query]
        results = []
        for entry in self._entries.values():
            if category and entry.category != category:
                continue
            haystack = entry.searchable_text()
            if any(term in haystack for term in terms):
                results.append(entry)
        return results
