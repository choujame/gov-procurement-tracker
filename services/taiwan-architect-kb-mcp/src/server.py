#!/usr/bin/env python3
"""Taiwan architect/building-code knowledge base MCP server.

Hand-rolled JSON-RPC 2.0 / MCP stdio transport implementation using only the
Python standard library. This project's other MCP server (the procurement
tracker) depends on the official `@modelcontextprotocol/sdk` npm package,
which could not be installed in this environment (no package registry
access). To keep this second server actually runnable and testable in the
same environment, it implements the minimal slice of the MCP protocol
(initialize, tools/list, tools/call) directly rather than depending on an
SDK. If you have registry access, consider migrating to the official
`mcp` Python SDK for full protocol coverage (resources, prompts, etc).
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Callable

sys.path.insert(0, str(Path(__file__).resolve().parent))

from store import KnowledgeBaseStore  # noqa: E402
from textrank import extract_keywords  # noqa: E402

SERVER_NAME = "taiwan-architect-kb"
SERVER_VERSION = "0.1.0"

TOOLS: list[dict[str, Any]] = [
    {
        "name": "search_kb",
        "description": (
            "Search the Taiwan building-code / architect-regulation knowledge "
            "base by keyword. Optionally filter by category (statute, "
            "regulation)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Keyword(s) to search for"},
                "category": {
                    "type": "string",
                    "description": "Optional category filter, e.g. 'statute' or 'regulation'",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_kb_entry",
        "description": "Fetch a single knowledge base entry by its id.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "Entry id, e.g. 'tw-building-act'"},
            },
            "required": ["id"],
        },
    },
    {
        "name": "extract_keywords",
        "description": (
            "Run TextRank-style keyword/phrase extraction over Chinese text "
            "(e.g. a procurement tender description) and return the top "
            "ranked terms."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Chinese text to extract keywords from"},
                "topK": {"type": "integer", "description": "Number of keywords to return (default 10)"},
            },
            "required": ["text"],
        },
    },
    {
        "name": "suggest_related_codes",
        "description": (
            "Extract keywords from Chinese text (e.g. a construction-related "
            "procurement tender description) and use them to look up "
            "potentially relevant building-code / architect-regulation "
            "knowledge base entries."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Chinese text to find related codes for"},
                "topK": {"type": "integer", "description": "Max number of KB entries to return (default 5)"},
            },
            "required": ["text"],
        },
    },
]


class KbServer:
    def __init__(self) -> None:
        self.store = KnowledgeBaseStore()
        self._handlers: dict[str, Callable[[dict[str, Any]], Any]] = {
            "search_kb": self._search_kb,
            "get_kb_entry": self._get_kb_entry,
            "extract_keywords": self._extract_keywords,
            "suggest_related_codes": self._suggest_related_codes,
        }

    def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        handler = self._handlers.get(name)
        if handler is None:
            return _error_result(f"Unknown tool: {name}")
        try:
            return handler(arguments)
        except Exception as exc:  # noqa: BLE001
            return _error_result(f"{type(exc).__name__}: {exc}")

    def _search_kb(self, args: dict[str, Any]) -> dict[str, Any]:
        query = args["query"]
        category = args.get("category")
        results = self.store.search(query, category=category)
        return _json_result(
            {
                "count": len(results),
                "entries": [_entry_summary(e) for e in results],
            }
        )

    def _get_kb_entry(self, args: dict[str, Any]) -> dict[str, Any]:
        entry = self.store.get(args["id"])
        if entry is None:
            return _error_result(f"No entry with id: {args['id']}")
        return _json_result(_entry_full(entry))

    def _extract_keywords(self, args: dict[str, Any]) -> dict[str, Any]:
        top_k = int(args.get("topK", 10))
        keywords = extract_keywords(args["text"], top_k=top_k)
        return _json_result(
            {"keywords": [{"term": k.term, "score": round(k.score, 6)} for k in keywords]}
        )

    def _suggest_related_codes(self, args: dict[str, Any]) -> dict[str, Any]:
        top_k = int(args.get("topK", 5))
        keywords = extract_keywords(args["text"], top_k=15)

        hit_counts: Counter[str] = Counter()
        matched_by_keyword: dict[str, list[str]] = {}
        for kw in keywords:
            for entry in self.store.search(kw.term):
                hit_counts[entry.id] += 1
                matched_by_keyword.setdefault(entry.id, []).append(kw.term)

        ranked_ids = [eid for eid, _ in hit_counts.most_common(top_k)]
        suggestions = []
        for eid in ranked_ids:
            entry = self.store.get(eid)
            if entry is None:
                continue
            suggestions.append(
                {
                    **_entry_summary(entry),
                    "matched_keywords": matched_by_keyword[eid],
                }
            )

        return _json_result(
            {
                "extracted_keywords": [k.term for k in keywords],
                "suggestions": suggestions,
            }
        )


def _entry_summary(entry) -> dict[str, Any]:
    return {
        "id": entry.id,
        "category": entry.category,
        "title": entry.title,
        "summary": entry.summary,
        "status": entry.status,
    }


def _entry_full(entry) -> dict[str, Any]:
    return {
        **_entry_summary(entry),
        "full_text": entry.full_text,
        "source_url": entry.source_url,
        "tags": entry.tags,
    }


def _json_result(payload: dict[str, Any]) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False, indent=2)}]}


def _error_result(message: str) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": message}], "isError": True}


def _write_message(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _handle_request(server: KbServer, request: dict[str, Any]) -> dict[str, Any] | None:
    method = request.get("method")
    request_id = request.get("id")
    params = request.get("params") or {}

    if method == "initialize":
        result = {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
        }
        return {"jsonrpc": "2.0", "id": request_id, "result": result}

    if method == "notifications/initialized":
        return None

    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": request_id, "result": {"tools": TOOLS}}

    if method == "tools/call":
        name = params.get("name")
        arguments = params.get("arguments") or {}
        result = server.call_tool(name, arguments)
        return {"jsonrpc": "2.0", "id": request_id, "result": result}

    if method == "ping":
        return {"jsonrpc": "2.0", "id": request_id, "result": {}}

    if request_id is None:
        return None
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": -32601, "message": f"Method not found: {method}"},
    }


def main() -> None:
    server = KbServer()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue
        response = _handle_request(server, request)
        if response is not None:
            _write_message(response)


if __name__ == "__main__":
    main()
