// GitHub OAuth login flow, run as the OAuthProvider's `defaultHandler`.
//
// UNVERIFIED against a real Workers/OAuthProvider runtime (see README).
// Deliberately avoids the `octokit` dependency (uses `fetch` against
// GitHub's REST API directly) to keep the unverifiable surface smaller.
//
// Flow:
//   GET  /authorize  -> parse the MCP client's auth request; if this
//                        client was already approved (signed cookie),
//                        skip straight to GitHub; otherwise show a
//                        consent screen.
//   POST /authorize  -> handle the consent screen submission, redirect
//                        to GitHub on approval.
//   GET  /callback   -> exchange GitHub's code for a token, fetch the
//                        user's profile, and complete the upstream
//                        OAuth flow via OAUTH_PROVIDER.completeAuthorization.

import { Hono } from "hono";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { AuthProps, Env } from "./index.js";
import {
  clientIdAlreadyApproved,
  parseRedirectApproval,
  renderApprovalDialog,
} from "./workers-oauth-utils.js";

type Bindings = Env & { OAUTH_PROVIDER: OAuthHelpers };

const app = new Hono<{ Bindings: Bindings }>();

const SERVER_INFO = {
  name: "Taiwan Architect KB MCP Server",
  description:
    "Search a Taiwan building-code / architect-regulation knowledge base and cross-reference it against procurement tender text.",
};

app.get("/authorize", async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const clientId = oauthReqInfo.clientId;
  if (!clientId) return c.text("Invalid authorization request: missing client_id", 400);

  if (await clientIdAlreadyApproved(c.req.raw, clientId, c.env.COOKIE_ENCRYPTION_KEY)) {
    return redirectToGitHub(c.req.raw, oauthReqInfo, c.env);
  }

  const client = await c.env.OAUTH_PROVIDER.lookupClient(clientId);
  return renderApprovalDialog(c.req.raw, {
    client,
    server: SERVER_INFO,
    state: { oauthReqInfo },
  });
});

app.post("/authorize", async (c) => {
  const { action, state, headers } = await parseRedirectApproval(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY);
  const oauthReqInfo = (state as { oauthReqInfo?: AuthRequest }).oauthReqInfo;
  if (!oauthReqInfo?.clientId) return c.text("Invalid authorization state", 400);

  if (action === "deny") {
    return c.text("Authorization denied", 403);
  }

  return redirectToGitHub(c.req.raw, oauthReqInfo, c.env, headers);
});

async function redirectToGitHub(
  request: Request,
  oauthReqInfo: AuthRequest,
  env: Env,
  extraHeaders: Record<string, string> = {},
) {
  const upstreamUrl = new URL("https://github.com/login/oauth/authorize");
  upstreamUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  upstreamUrl.searchParams.set("redirect_uri", new URL("/callback", request.url).href);
  upstreamUrl.searchParams.set("scope", "read:user user:email");
  upstreamUrl.searchParams.set("state", btoa(JSON.stringify(oauthReqInfo)));

  return new Response(null, {
    status: 302,
    headers: { ...extraHeaders, Location: upstreamUrl.href },
  });
}

app.get("/callback", async (c) => {
  const stateParam = c.req.query("state");
  const code = c.req.query("code");
  if (!stateParam || !code) return c.text("Missing state or code", 400);

  let oauthReqInfo: AuthRequest;
  try {
    oauthReqInfo = JSON.parse(atob(stateParam));
  } catch {
    return c.text("Invalid state", 400);
  }
  if (!oauthReqInfo.clientId) return c.text("Invalid state", 400);

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: new URL("/callback", c.req.url).href,
    }),
  });
  if (!tokenResponse.ok) {
    return c.text(`Failed to exchange code with GitHub: ${tokenResponse.status}`, 502);
  }
  const tokenJson = (await tokenResponse.json()) as { access_token?: string; error?: string };
  if (!tokenJson.access_token) {
    return c.text(`GitHub token exchange error: ${tokenJson.error ?? "unknown"}`, 502);
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      "User-Agent": "taiwan-architect-kb-mcp",
      Accept: "application/vnd.github+json",
    },
  });
  if (!userResponse.ok) {
    return c.text(`Failed to fetch GitHub user profile: ${userResponse.status}`, 502);
  }
  const user = (await userResponse.json()) as { login: string; name: string | null; email: string | null };

  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: user.login,
    metadata: { label: user.name ?? user.login },
    scope: oauthReqInfo.scope,
    props: {
      login: user.login,
      name: user.name ?? user.login,
      email: user.email ?? undefined,
    } satisfies AuthProps,
  });

  return Response.redirect(redirectTo);
});

export const GitHubHandler = app;
