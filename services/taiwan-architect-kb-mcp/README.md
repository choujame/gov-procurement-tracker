# taiwan-architect-kb-mcp

An MCP server exposing a searchable knowledge base of Taiwan building codes
and architect/construction regulations, and a tool to suggest relevant
codes for a piece of Chinese procurement-tender text (e.g. from
`gov-procurement-tracker`'s `search_tenders` tool).

It's deliberately dependency-free (Python standard library only) so it can
be run and tested without any package installation.

## Why no dependencies

This was built in a network-restricted sandbox with no access to PyPI/npm.
Rather than write code against SDKs that couldn't be installed or verified,
this server:

- Implements the MCP stdio transport (JSON-RPC 2.0, newline-delimited JSON)
  directly in `src/server.py`, covering `initialize`, `tools/list`, and
  `tools/call` — the subset needed to serve tools. If you have package
  registry access, consider migrating to the official `mcp` Python SDK for
  full protocol coverage (resources, prompts, cancellation, etc).
- Implements a lightweight, segmentation-free approximation of
  [TextRank4ZH](https://github.com/letiantian/TextRank4ZH)'s keyword
  extraction in `src/textrank.py` (character n-gram graph + PageRank,
  instead of jieba word segmentation + PageRank). It's strictly weaker at
  producing clean word boundaries than the real jieba-backed algorithm —
  swap in `textrank4zh` + `jieba` once you can install them.

## Data provenance — important

`data/building_codes.json` is a **placeholder dataset**. It names real,
well-known Taiwan statutes/regulation families (建築法, 建築技術規則,
建築師法, 消防法, 都市計畫法, 政府採購法, and accessibility-related
regulations) at a title level only. `full_text` is intentionally left
empty for every entry, and no article numbers or clause text are asserted,
because this session had no network access to verify current statute text
against an authoritative source (全國法規資料庫, `law.moj.gov.tw`) or
against the referenced `h30190/HJPLUS_Taiwan_Architect_KB` repository,
which could not be fetched either.

**Do not treat this data as legally authoritative.** Populate `full_text`
and verify `source_url` per entry from an authoritative source before using
this for anything beyond a structural demo.

## Tools

| Tool | Description |
| --- | --- |
| `search_kb` | Keyword search over KB entries, optional category filter. |
| `get_kb_entry` | Fetch a single KB entry by id. |
| `extract_keywords` | TextRank-style keyword/phrase extraction over Chinese text. |
| `suggest_related_codes` | Extract keywords from text and use them to look up potentially relevant KB entries — the main integration point with procurement tender descriptions. |

## Running

```bash
python3 src/server.py
```

Speaks newline-delimited JSON-RPC 2.0 on stdin/stdout per the MCP stdio
transport. Example client config:

```json
{
  "mcpServers": {
    "taiwan-architect-kb": {
      "command": "python3",
      "args": ["/absolute/path/to/services/taiwan-architect-kb-mcp/src/server.py"]
    }
  }
}
```

## Running over HTTP (remote / mobile clients)

Local stdio servers (above) only work with clients that can spawn a local
subprocess on the same machine — e.g. Claude Desktop. Mobile apps and other
remote clients need a server reachable over HTTPS instead. `src/http_server.py`
exposes the same tool logic over the MCP **Streamable HTTP** transport: a
single `POST /mcp` endpoint that accepts a JSON-RPC request (or batch) and
returns a JSON-RPC response.

```bash
PORT=8765 MCP_HTTP_AUTH_TOKEN=changeme python3 src/http_server.py
```

- `PORT` — defaults to `8765`.
- `MCP_HTTP_AUTH_TOKEN` — if set, every request must include
  `Authorization: Bearer <token>`, or the server returns `401`. Leave unset
  only for local testing; **set it before exposing this publicly**.
- `GET /health` — plain health check, no auth required.
- `GET /mcp` — intentionally returns `405`. This server has no
  server-initiated messages to push (it's pure request/response), so the
  optional SSE stream half of the Streamable HTTP transport isn't
  implemented. Add it if you later add long-running tools or notifications.

Verified locally in this repo's dev sandbox with real HTTP requests
(`initialize`, `tools/list`, `tools/call` for all four tools, a
notification-only request returning `202`, and both the unauthenticated and
wrong-token `401` paths) — see the commit history for the exact test
commands.

### What you still need to do to actually use this from a phone

This server only listens on `localhost` unless you deploy it somewhere with
a public HTTPS address — that step needs your own hosting (a VPS, Fly.io,
Render, Cloudflare Workers/Containers, etc.) and **could not be done or
verified from this sandbox** (no outbound deploy access). A `Dockerfile` is
included as a starting point:

```bash
docker build -t taiwan-architect-kb-mcp .
docker run -p 8765:8765 -e MCP_HTTP_AUTH_TOKEN=changeme taiwan-architect-kb-mcp
```

(Not build-tested here either — pulling the `python:3.11-slim` base image
needs registry access this sandbox doesn't have. It's a standard two-line
Dockerfile, but verify it builds before relying on it.)

You'll also need TLS termination in front of it (the app itself only speaks
plain HTTP) — typically handled by whatever PaaS/reverse proxy you deploy
behind. Finally, whether a given mobile Claude client can actually add a
remote MCP server like this depends on that client's support for
Streamable HTTP servers, which varies by app/version — check the client's
own docs.

## Development

```bash
python3 -m unittest discover -s test -v
```

## Project layout

```
src/
  server.py        MCP stdio server (hand-rolled JSON-RPC, no SDK dependency)
  http_server.py    MCP Streamable HTTP server (same tool logic, for remote/mobile clients)
  store.py          JSON-file-backed KB store
  textrank.py        Segmentation-free Chinese TextRank keyword extraction
data/
  building_codes.json   Placeholder KB entries (see Data provenance above)
test/
  test_store.py
  test_textrank.py
Dockerfile           Starting point for deploying http_server.py (untested, see above)
```
