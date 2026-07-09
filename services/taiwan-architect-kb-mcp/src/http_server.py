#!/usr/bin/env python3
"""HTTP (Streamable HTTP transport) entrypoint for the same MCP server.

Implements the request/response half of the MCP "Streamable HTTP" transport:
a single POST endpoint that accepts a JSON-RPC request (or batch) and
returns a JSON-RPC response. This is enough for a stateless tools-only
server like this one (no server-initiated push messages, so the optional
SSE stream on GET is intentionally not implemented — see README).

Stdlib-only (http.server), so it can run and be tested without installing
anything, same rationale as server.py (this sandbox has no package
registry access).
"""

from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from server import KbServer, _handle_request  # noqa: E402

AUTH_TOKEN = os.environ.get("MCP_HTTP_AUTH_TOKEN", "")
MCP_PATH = "/mcp"
HEALTH_PATH = "/health"

_server = KbServer()


class MCPRequestHandler(BaseHTTPRequestHandler):
    server_version = "taiwan-architect-kb-mcp-http/0.1"

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))

    def _send_json(self, status: int, payload: dict[str, Any] | None) -> None:
        body = b"" if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _check_auth(self) -> bool:
        if not AUTH_TOKEN:
            return True
        header = self.headers.get("Authorization", "")
        return header == f"Bearer {AUTH_TOKEN}"

    def do_GET(self) -> None:  # noqa: N802
        if self.path == HEALTH_PATH:
            self._send_json(200, {"status": "ok"})
            return
        if self.path == MCP_PATH:
            # Server-initiated SSE stream is intentionally not implemented;
            # this server has no notifications/server-push to send.
            self._send_json(
                405,
                {"error": "GET (SSE stream) not implemented; this server is request/response only"},
            )
            return
        self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != MCP_PATH:
            self._send_json(404, {"error": "not found"})
            return
        if not self._check_auth():
            self._send_json(401, {"error": "unauthorized"})
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b""
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "invalid JSON"})
            return

        requests = payload if isinstance(payload, list) else [payload]
        responses = []
        for req in requests:
            resp = _handle_request(_server, req)
            if resp is not None:
                responses.append(resp)

        if not responses:
            # all-notification batch: MCP Streamable HTTP allows 202 + empty body
            self._send_json(202, None)
            return

        result = responses[0] if not isinstance(payload, list) else responses
        self._send_json(200, result)


def main() -> None:
    port = int(os.environ.get("PORT", "8765"))
    httpd = ThreadingHTTPServer(("0.0.0.0", port), MCPRequestHandler)
    print(f"taiwan-architect-kb-mcp HTTP server listening on :{port}{MCP_PATH}", file=sys.stderr)
    if AUTH_TOKEN:
        print("Auth: Bearer token required (MCP_HTTP_AUTH_TOKEN set)", file=sys.stderr)
    else:
        print("Auth: DISABLED (set MCP_HTTP_AUTH_TOKEN to require a bearer token)", file=sys.stderr)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
