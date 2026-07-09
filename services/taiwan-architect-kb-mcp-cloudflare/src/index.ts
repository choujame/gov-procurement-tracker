// Cloudflare Worker entrypoint: remote MCP server behind GitHub OAuth.
//
// UNVERIFIED (see README "What's verified vs not" section). Structure
// follows Cloudflare's own "MCP server with GitHub OAuth" reference
// pattern (McpAgent from the `agents` package + OAuthProvider from
// `@cloudflare/workers-oauth-provider`), reconstructed from training
// knowledge without live access to Cloudflare's docs/template repo in
// this sandbox (network policy blocks it). Cross-check against Cloudflare's
// current docs/template before deploying — exact export names and the
// OAuthProvider config shape (e.g. `apiHandlers` vs `apiRoute`/`apiHandler`)
// have changed across package versions.

import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GitHubHandler } from "./github-handler.js";
import { registerTools } from "./tools.js";

export interface Env {
  OAUTH_KV: KVNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  COOKIE_ENCRYPTION_KEY: string;
}

/** GitHub user info persisted into each authenticated session's `props`. */
export interface AuthProps {
  login: string;
  name: string;
  email?: string;
}

export class TaiwanArchitectKbMCP extends McpAgent<Env, unknown, AuthProps> {
  server = new McpServer({ name: "taiwan-architect-kb", version: "0.1.0" });

  async init() {
    registerTools(this.server);
  }
}

export default new OAuthProvider({
  apiHandlers: {
    "/sse": TaiwanArchitectKbMCP.serveSSE("/sse"),
    "/mcp": TaiwanArchitectKbMCP.serve("/mcp"),
  },
  defaultHandler: GitHubHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
