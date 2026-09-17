# Safe database and integration tests

Database-dependent tests and database-changing commands must identify their target
before creating a connection. An unidentified target is unsafe and is rejected.

## Test environment

Use a disposable database with a stable identifier in its host or database name.
Run database-dependent tests with all of these variables:

```sh
APP_ENV=test
ALLOW_DATABASE_TESTS=true
TEST_DATABASE_ID=<disposable-database-identifier>
TEST_DATABASE_URL=<disposable-postgresql-url>
OUTBOUND_NOTIFICATIONS_MODE=mock
```

`TEST_DATABASE_URL` is the only URL accepted by test code. Tests never fall back
to `SUPABASE_DATABASE_URL`, `DATABASE_URL`, or a deployed connection.
`TEST_DATABASE_ID` must match the parsed host, project reference, username, or
database name from the URL.

Configure `PRODUCTION_DATABASE_FINGERPRINTS` (or its singular equivalent) in
the test environment with safe fingerprints for production hosts, usernames, or
project references. These values are not committed to the repository. A matching
target is rejected before a connection is created.

Real WhatsApp, SMS, push, and email providers are disabled in test mode. The
test setup must use `OUTBOUND_NOTIFICATIONS_MODE=mock` and must not expose real
provider credentials. WhatsApp and push calls use no-op test providers.

## Development database commands

The Drizzle push commands are guarded separately:

```sh
APP_ENV=development
DEVELOPMENT_DATABASE_ID=<development-database-identifier>
DATABASE_URL=<development-postgresql-url>
```

The identifier must match the parsed database identity. Production fingerprints
are rejected. Development code uses `DATABASE_URL`; it does not prefer or
inherit `SUPABASE_DATABASE_URL`.

Run only the unit and configuration checks until a disposable database exists:

```sh
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/db test
```

Do not run authenticated integration tests, migrations, cleanup scripts, or
test-account creation until the disposable database has been created and its
identity has been verified. Unsafe setup fails with an `Unsafe database
configuration` error without printing credentials or a complete URL.