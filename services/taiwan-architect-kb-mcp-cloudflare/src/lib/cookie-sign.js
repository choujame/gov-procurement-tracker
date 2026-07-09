/**
 * HMAC-signed cookie value helpers, using only the standard Web Crypto API
 * (`crypto.subtle`, `btoa`/`atob`) so the same code runs unmodified in a
 * Cloudflare Worker and under plain Node (both expose these globally),
 * letting the signing logic be unit tested with `node --test` even though
 * the rest of the OAuth flow can't be exercised without a Workers runtime.
 *
 * Used to remember which OAuth client IDs a user has already approved,
 * so the consent screen can be skipped on repeat authorizations from the
 * same MCP client.
 */

export const APPROVAL_COOKIE_NAME = "approved_clients";
export const APPROVAL_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function toBase64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str) {
  const padLength = (4 - (str.length % 4)) % 4;
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * @param {string[]} clientIds
 * @param {string} secret
 * @returns {Promise<string>} cookie value: "<payload>.<signature>", both base64url
 */
export async function signApprovedClients(clientIds, secret) {
  const payload = JSON.stringify(clientIds);
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${toBase64Url(new TextEncoder().encode(payload))}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * @param {string} cookieValue
 * @param {string} secret
 * @returns {Promise<string[] | null>} parsed client ID list, or null if missing/invalid/tampered
 */
export async function verifyApprovedClients(cookieValue, secret) {
  if (!cookieValue) return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  let payloadBytes;
  let sigBytes;
  try {
    payloadBytes = fromBase64Url(payloadB64);
    sigBytes = fromBase64Url(sigB64);
  } catch {
    return null;
  }

  const key = await importHmacKey(secret);
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, payloadBytes);
  if (!valid) return null;

  try {
    const parsed = JSON.parse(new TextDecoder().decode(payloadBytes));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
