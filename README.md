# gov-procurement-tracker

This repo hosts two [MCP](https://modelcontextprotocol.io) servers:

- **(this directory)** — searches and tracks Taiwan government procurement
  records (tenders, awards, vendors, agencies).
- **[`services/taiwan-architect-kb-mcp`](services/taiwan-architect-kb-mcp)**
  — a Taiwan building-code / architect-regulation knowledge base that can
  suggest relevant codes for a tender's description, cross-referencing the
  procurement data above with construction regulation topics.

---

An MCP server for searching and tracking
Taiwan government procurement records: tender announcements (招標公告), award
announcements (決標公告), vendor award history, and agency procurement
history.

It talks to the public [g0v](https://g0v.tw) community mirror of the
Republic of China Public Construction Commission (公共工程委員會, PCC) open
procurement data at `pcc.g0v.ronny.tw`, which re-publishes records from the
official Government e-Procurement website (政府電子採購網,
`web.pcc.gov.tw`). The base URL is configurable, so you can point the server
at the official PCC API instead if you have access to it.

> **Note on data source assumptions:** this server was scaffolded in a
> network-restricted environment where the live API could not be reached to
> confirm exact field names/shapes. The endpoints, parameters, and response
> shapes in `src/pccClient.ts` and `src/types.ts` reflect the commonly
> documented structure of the `pcc.g0v.ronny.tw` API. Verify against the live
> API and adjust `src/types.ts` / `src/pccClient.ts` if any field names have
> drifted.

## Tools

| Tool | Description |
| --- | --- |
| `search_tenders` | Search tender/award notices by keyword, with optional filtering to tenders only, awards only, or all. Paginated. |
| `get_vendor_awards` | Look up a vendor's contract award history by company name. |
| `get_agency_records` | Look up a government agency's tender/award history by unit ID. |
| `get_tender_detail` | Fetch the full detail record for a specific notice by unit ID + job number. |

## Setup

```bash
npm install
npm run build
```

Copy `.env.example` to `.env` and adjust if you want to point at a different
API base URL:

```bash
cp .env.example .env
```

## Running

As a standalone MCP stdio server:

```bash
npm start
```

During development, run directly from TypeScript source:

```bash
npm run dev
```

### Using with an MCP client (e.g. Claude Desktop / Claude Code)

Add an entry pointing at the built server:

```json
{
  "mcpServers": {
    "gov-procurement-tracker": {
      "command": "node",
      "args": ["/absolute/path/to/gov-procurement-tracker/dist/index.js"]
    }
  }
}
```

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest
```

## Remote / mobile clients (HTTP transport)

Not implemented yet. The stdio transport above only works with clients that
spawn a local subprocess (e.g. Claude Desktop). To support remote/mobile
clients this would need an MCP Streamable HTTP entrypoint — analogous to
`services/taiwan-architect-kb-mcp/src/http_server.py` — built on
`StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk`. That
wasn't added here because it can't be verified without npm registry access
in this environment (see the caveat above). Deploying it publicly would
also need your own HTTPS-capable hosting either way.

## Project layout

```
src/
  index.ts          MCP server entrypoint, registers all tools
  pccClient.ts       HTTP client for the PCC procurement data API
  types.ts           Shared response types
  tools/             One file per MCP tool
test/
  pccClient.test.ts  Unit tests for the HTTP client (mocked fetch)
```
