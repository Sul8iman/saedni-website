import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { normalizeOmanPhone } from "./phone-normalization.ts";

type HistoricalAccount = {
  phone: string;
  userType: "customer" | "helper";
  id: number;
};

function databaseNormalizedPhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "").slice(-8);
}

test("role-specific login resolves historical phone formats when both roles share a number", async () => {
  const requestedPhone = normalizeOmanPhone("91 000 001");
  assert.equal(requestedPhone, "96891000001");

  const accounts: HistoricalAccount[] = [
    { id: 101, phone: "+968 91-000-001", userType: "customer" },
    { id: 102, phone: "0096891000001", userType: "helper" },
  ];

  const totalMatches = accounts.filter(
    (account) => databaseNormalizedPhone(account.phone) === requestedPhone.slice(-8),
  );
  const helperMatches = totalMatches.filter((account) => account.userType === "helper");
  const customerMatches = totalMatches.filter((account) => account.userType === "customer");

  assert.equal(totalMatches.length, 2);
  assert.deepEqual(helperMatches.map((account) => account.id), [102]);
  assert.deepEqual(customerMatches.map((account) => account.id), [101]);

  const source = await readFile(new URL("../routes/auth.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /right\(regexp_replace\(\$\{usersTable\.phone\}, '\[\^0-9\]', '', 'g'\), 8\)/,
    "the production lookup must normalize stored phones in SQL and compare their final eight digits",
  );
  assert.match(
    source,
    /and\(condition, eq\(usersTable\.userType, userType\)\)/,
    "the production lookup must include the submitted account type",
  );
});