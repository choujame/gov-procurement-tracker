# taiwan-architect-kb-mcp-cloudflare

Remote deployment of the Taiwan architect/building-code knowledge base MCP
server: a Cloudflare Worker, behind GitHub OAuth, reachable over HTTPS —
so it can be used from mobile Claude clients (or any MCP client that
supports remote/Streamable HTTP servers), not just Claude Desktop's local
stdio integration.

Same 4 tools as the local versions
([`taiwan-architect-kb-mcp`](../taiwan-architect-kb-mcp)): `search_kb`,
`get_kb_entry`, `extract_keywords`, `suggest_related_codes`. Same
placeholder-dataset caveat applies — see
[Data provenance](../taiwan-architect-kb-mcp/README.md#data-provenance--important)
in that README; it wasn't duplicated here.

## What's verified vs. not

This was built in a sandbox with **no npm registry or Cloudflare API
access** — `wrangler`, `@cloudflare/workers-oauth-provider`, `agents`, and
`@modelcontextprotocol/sdk` could not be installed, and `wrangler dev`
could not be run. Be aware of the difference in confidence level across
files:

| File | Verified how |
| --- | --- |
| `src/lib/textrank.js`, `src/lib/store.js` | ✅ Actually run with `node --test` (11 tests, see `test/lib.test.mjs`) — direct port of the already-verified Python version. |
| `src/lib/cookie-sign.js` | ✅ Actually run with `node --test` (6 tests, see `test/cookie-sign.test.mjs`) — uses only standard Web Crypto (`crypto.subtle`), so it behaves identically under Node and Workers. |
| `src/tools.ts` | ⚠️ TypeScript syntax-checked only (no type errors via `tsc`'s transpile step). Depends on `@modelcontextprotocol/sdk`'s `McpServer#registerTool` API, not exercised against the real package. |
| `src/index.ts` | ⚠️ Syntax-checked only. Depends on `agents`' `McpAgent` class and `@cloudflare/workers-oauth-provider`'s `OAuthProvider` — in particular the `apiHandlers` config shape and `McpAgent.serve`/`serveSSE` static methods, reconstructed from training knowledge without live docs access. **Verify these exact names against the current package versions before deploying** — they're the most likely thing to have drifted. |
| `src/github-handler.ts`, `src/workers-oauth-utils.ts` | ⚠️ Syntax-checked only. The OAuth request/response plumbing (`OAUTH_PROVIDER.parseAuthRequest`, `.lookupClient`, `.completeAuthorization`) needs a real Workers + OAuthProvider runtime to exercise; not available here. |

In short: the pure-logic pieces (keyword extraction, KB search, cookie
signing) are genuinely tested. The Cloudflare/OAuth integration glue is a
best-effort reconstruction of Cloudflare's own "MCP server with GitHub
OAuth" reference pattern and needs your own `wrangler dev` pass — and a
diff against Cloudflare's current template/docs — before you trust it in
production.

## Setup

### 1. Create a GitHub OAuth App

GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.

- Homepage URL: your worker's URL (you'll get this after first deploy,
  e.g. `https://taiwan-architect-kb-mcp.<your-subdomain>.workers.dev`) —
  a placeholder is fine for the first save, update it after deploying.
- Authorization callback URL: `https://<same-host>/callback`

Note the generated **Client ID** and **Client Secret**.

### 2. Create the OAuth KV namespace

```bash
npx wrangler kv namespace create OAUTH_KV
```

Copy the returned `id` into `wrangler.jsonc`'s `kv_namespaces[0].id`.

### 3. Configure secrets and vars

```bash
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put COOKIE_ENCRYPTION_KEY   # e.g. `openssl rand -hex 32`
```

Set `GITHUB_CLIENT_ID` directly in `wrangler.jsonc`'s `vars` (not secret —
client IDs are public).

For local dev, copy `.dev.vars.example` to `.dev.vars` and fill in real
values instead.

### 4. Install dependencies and deploy

```bash
npm install
npm run dev      # local dev via wrangler, needs network access to Cloudflare
npm run deploy    # publish to your Cloudflare account
```

None of this was run in this sandbox (see table above) — this is the step
where you actually find out if it works.

### 5. Point a client at it

Once deployed, the server is reachable at:

- `https://<your-worker>.workers.dev/mcp` (Streamable HTTP — prefer this)
- `https://<your-worker>.workers.dev/sse` (SSE transport, for older clients)

Add it as a remote/custom MCP connector in whatever client you're using
(desktop, web, or mobile) — the client will redirect you through GitHub to
authorize, then have access to the four tools. Whether a given mobile
Claude client supports adding remote MCP servers at all depends on that
app's version; check its own docs.

## Development

```bash
npm test         # runs the verified pure-logic tests (node --test)
npm run typecheck # tsc --noEmit — requires `npm install` first
```

## Project layout

```
src/
  index.ts               Worker entry: OAuthProvider + McpAgent wiring
  tools.ts                MCP tool registration (search_kb, get_kb_entry, extract_keywords, suggest_related_codes)
  github-handler.ts        GitHub OAuth login flow (Hono app)
  workers-oauth-utils.ts   Approval-dialog rendering + cookie plumbing
  lib/
    textrank.js            Chinese TextRank keyword extraction (verified)
    store.js                KB store (verified)
    cookie-sign.js           HMAC cookie signing (verified)
data/
  building-codes.json      Same placeholder dataset as the local server
test/
  lib.test.mjs             Tests for textrank.js / store.js
  cookie-sign.test.mjs      Tests for cookie-sign.js
wrangler.jsonc             Cloudflare Worker config (durable object + KV bindings)
.dev.vars.example          Template for local secrets
```
