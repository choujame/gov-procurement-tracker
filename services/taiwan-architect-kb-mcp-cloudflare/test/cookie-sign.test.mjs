import assert from "node:assert/strict";
import test from "node:test";

import {
  signApprovedClients,
  verifyApprovedClients,
} from "../src/lib/cookie-sign.js";

const SECRET = "test-secret-key-do-not-use-in-prod";

test("sign then verify round-trips the client ID list", async () => {
  const ids = ["client-a", "client-b"];
  const cookie = await signApprovedClients(ids, SECRET);
  const verified = await verifyApprovedClients(cookie, SECRET);
  assert.deepEqual(verified, ids);
});

test("verify rejects a tampered payload", async () => {
  const cookie = await signApprovedClients(["client-a"], SECRET);
  const [payload, sig] = cookie.split(".");
  const tampered = `${payload}xx.${sig}`;
  assert.equal(await verifyApprovedClients(tampered, SECRET), null);
});

test("verify rejects a cookie signed with a different secret", async () => {
  const cookie = await signApprovedClients(["client-a"], SECRET);
  assert.equal(await verifyApprovedClients(cookie, "wrong-secret"), null);
});

test("verify rejects malformed cookie values", async () => {
  assert.equal(await verifyApprovedClients("not-a-valid-cookie", SECRET), null);
  assert.equal(await verifyApprovedClients("", SECRET), null);
});

test("round-trips an empty list", async () => {
  const cookie = await signApprovedClients([], SECRET);
  assert.deepEqual(await verifyApprovedClients(cookie, SECRET), []);
});

test("round-trips client IDs containing unicode", async () => {
  const ids = ["客戶端-一", "client-emoji-🔑"];
  const cookie = await signApprovedClients(ids, SECRET);
  assert.deepEqual(await verifyApprovedClients(cookie, SECRET), ids);
});
