import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafeDevelopmentDatabaseEnvironment,
  assertSafeTestOutboundEnvironment,
  DatabaseSafetyError,
  getRuntimeDatabaseUrl,
  getTestDatabaseUrl,
  parseDatabaseIdentity,
} from "./test-safety.ts";

const safeTestEnvironment = {
  APP_ENV: "test",
  ALLOW_DATABASE_TESTS: "true",
  TEST_DATABASE_ID: "disposable-test-project",
  TEST_DATABASE_URL: "postgresql://test-user:test-password@disposable-test-project.test.invalid:5432/test_db",
  OUTBOUND_NOTIFICATIONS_MODE: "mock",
};

function assertSafetyError(action: () => unknown, expected: RegExp): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof DatabaseSafetyError);
    assert.match(error.message, expected);
    assert.doesNotMatch(error.message, /test-password|postgresql:\/\//);
    return true;
  });
}

test("database tests fail when TEST_DATABASE_URL is missing", () => {
  const env: Record<string, string | undefined> = { ...safeTestEnvironment };
  delete env.TEST_DATABASE_URL;
  assertSafetyError(() => getTestDatabaseUrl(env), /TEST_DATABASE_URL is required/);
});

test("database tests fail when APP_ENV is production", () => {
  assertSafetyError(
    () =>
      getTestDatabaseUrl({
        ...safeTestEnvironment,
        APP_ENV: "production",
      }),
    /cannot run in a production environment/,
  );
});

test("database tests fail when the target matches a production fingerprint", () => {
  assertSafetyError(
    () =>
      getTestDatabaseUrl({
        ...safeTestEnvironment,
        TEST_DATABASE_URL: "postgresql://test-user:test-password@prod-project.test.invalid:5432/test_db",
        PRODUCTION_DATABASE_FINGERPRINTS: "prod-project",
      }),
    /matches a configured production database fingerprint/,
  );
});

test("database tests fail when the database identity is unknown", () => {
  assertSafetyError(
    () =>
      getTestDatabaseUrl({
        ...safeTestEnvironment,
        TEST_DATABASE_URL: "postgresql://test-user:test-password@localhost:5432/test_db",
      }),
    /does not match the verified disposable database identifier/,
  );
});

test("database tests fail when ALLOW_DATABASE_TESTS is absent", () => {
  const env: Record<string, string | undefined> = { ...safeTestEnvironment };
  delete env.ALLOW_DATABASE_TESTS;
  assertSafetyError(() => getTestDatabaseUrl(env), /ALLOW_DATABASE_TESTS must be true/);
});

test("database tests never fall back to production or development URLs", () => {
  assertSafetyError(
    () =>
      getTestDatabaseUrl({
        APP_ENV: "test",
        ALLOW_DATABASE_TESTS: "true",
        TEST_DATABASE_ID: "disposable-test-project",
        SUPABASE_DATABASE_URL: "postgresql://prod:secret@production.invalid/prod",
        DATABASE_URL: "postgresql://dev:secret@development.invalid/dev",
      }),
    /TEST_DATABASE_URL is required/,
  );
});

test("NODE_ENV=test cannot bypass the APP_ENV test marker", () => {
  assertSafetyError(
    () =>
      getRuntimeDatabaseUrl({
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://dev:secret@development.invalid/dev",
      }),
    /APP_ENV must be test/,
  );
});

test("real outbound notifications are rejected in test mode", () => {
  assertSafetyError(
    () =>
      assertSafeTestOutboundEnvironment({
        ...safeTestEnvironment,
        WHATSAPP_ACCESS_TOKEN: "fake-token",
      }),
    /real outbound provider WHATSAPP_ACCESS_TOKEN is enabled/,
  );
});

test("test outbound notifications require mock mode", () => {
  assertSafetyError(
    () =>
      assertSafeTestOutboundEnvironment({
        ...safeTestEnvironment,
        OUTBOUND_NOTIFICATIONS_MODE: "real",
      }),
    /OUTBOUND_NOTIFICATIONS_MODE must be mock/,
  );
});

test("unit-test configuration is accepted without opening a database connection", () => {
  assert.equal(parseDatabaseIdentity(safeTestEnvironment.TEST_DATABASE_URL).host, "disposable-test-project.test.invalid");
  assert.equal(getRuntimeDatabaseUrl(safeTestEnvironment), safeTestEnvironment.TEST_DATABASE_URL);
});

test("development database commands require a verified non-production target", () => {
  assert.equal(
    assertSafeDevelopmentDatabaseEnvironment({
      APP_ENV: "development",
      DEVELOPMENT_DATABASE_ID: "disposable-development-project",
      DATABASE_URL: "postgresql://dev-user:dev-password@disposable-development-project.test.invalid:5432/dev_db",
    }),
    "postgresql://dev-user:dev-password@disposable-development-project.test.invalid:5432/dev_db",
  );
});