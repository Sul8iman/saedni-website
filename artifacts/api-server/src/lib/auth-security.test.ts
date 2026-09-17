import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { isUserBlocked } from "./auth-security.ts";

test("blocked users are rejected regardless of verification state", () => {
  assert.equal(isUserBlocked({ isBlocked: true }), true);
  assert.equal(isUserBlocked({ isBlocked: true }), true);
  assert.equal(isUserBlocked({ isBlocked: false }), false);
});

test("every authentication entry point uses the blocked-account guard", async () => {
  const source = await readFile(new URL("../routes/auth.ts", import.meta.url), "utf8");

  assert.equal(source.includes('router.post("/auth/login"'), true);
  assert.equal(source.includes('router.post("/auth/admin-login"'), true);
  assert.equal(source.includes('router.post("/auth/verify-otp"'), true);
  assert.equal(source.includes('router.get("/auth/me"'), true);
  assert.equal(
    (source.match(/if \(isUserBlocked\(user\)\)/g) ?? []).length,
    4,
    "login, admin-login, verify-otp, and auth/me must all reject blocked users",
  );
  assert.doesNotMatch(source, /user\.isBlocked && user\.isVerified/);
});