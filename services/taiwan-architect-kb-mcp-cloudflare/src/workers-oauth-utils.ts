// Approval-dialog rendering and cookie plumbing for the GitHub OAuth flow.
//
// UNVERIFIED against a real Workers runtime (see README). The signing
// primitives it calls into (src/lib/cookie-sign.js) ARE unit-tested with
// plain Node — see test/cookie-sign.test.mjs — since they only use
// standard Web Crypto APIs available in both runtimes. The Request/Response
// plumbing below could not be exercised without workerd/Miniflare, which
// isn't installed in this sandbox.

import {
  APPROVAL_COOKIE_MAX_AGE_SECONDS,
  APPROVAL_COOKIE_NAME,
  signApprovedClients,
  verifyApprovedClients,
} from "./lib/cookie-sign.js";

function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) cookies[key] = value;
  }
  return cookies;
}

export async function clientIdAlreadyApproved(
  request: Request,
  clientId: string,
  cookieSecret: string,
): Promise<boolean> {
  const cookies = parseCookies(request.headers.get("Cookie"));
  const raw = cookies[APPROVAL_COOKIE_NAME];
  if (!raw) return false;
  const approved = await verifyApprovedClients(raw, cookieSecret);
  return approved?.includes(clientId) ?? false;
}

interface ApprovalDialogOptions {
  client: { clientId: string; clientName?: string } | null;
  server: { name: string; description: string };
  state: Record<string, unknown>;
}

export function renderApprovalDialog(request: Request, options: ApprovalDialogOptions): Response {
  const encodedState = btoa(JSON.stringify(options.state));
  const clientName = options.client?.clientName ?? options.client?.clientId ?? "Unknown client";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Authorize ${escapeHtml(options.server.name)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 480px; margin: 4rem auto; padding: 0 1rem; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; }
  button { padding: 0.6rem 1.2rem; border-radius: 6px; border: none; cursor: pointer; font-size: 1rem; }
  .approve { background: #1a7f37; color: white; }
  .deny { background: #eee; color: #333; margin-left: 0.5rem; }
</style>
</head>
<body>
  <div class="card">
    <h2>${escapeHtml(options.server.name)}</h2>
    <p>${escapeHtml(options.server.description)}</p>
    <p><strong>${escapeHtml(clientName)}</strong> is requesting access via your GitHub account.</p>
    <form method="POST">
      <input type="hidden" name="state" value="${encodedState}" />
      <button class="approve" type="submit" name="action" value="approve">Approve</button>
      <button class="deny" type="submit" name="action" value="deny">Deny</button>
    </form>
  </div>
</body>
</html>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function parseRedirectApproval(
  request: Request,
  cookieSecret: string,
): Promise<{ action: "approve" | "deny"; state: Record<string, unknown>; headers: Record<string, string> }> {
  const formData = await request.formData();
  const action = formData.get("action") === "approve" ? "approve" : "deny";
  const encodedState = String(formData.get("state") ?? "");
  const state = encodedState ? JSON.parse(atob(encodedState)) : {};

  const headers: Record<string, string> = {};
  if (action === "approve") {
    const clientId = (state as { oauthReqInfo?: { clientId?: string } }).oauthReqInfo?.clientId;
    if (clientId) {
      const cookies = parseCookies(request.headers.get("Cookie"));
      const existing = (await verifyApprovedClients(cookies[APPROVAL_COOKIE_NAME] ?? "", cookieSecret)) ?? [];
      const updated = existing.includes(clientId) ? existing : [...existing, clientId];
      const cookieValue = await signApprovedClients(updated, cookieSecret);
      headers["Set-Cookie"] =
        `${APPROVAL_COOKIE_NAME}=${cookieValue}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${APPROVAL_COOKIE_MAX_AGE_SECONDS}`;
    }
  }

  return { action, state, headers };
}
