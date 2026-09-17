const TEST_ENVIRONMENT = "test";
const DEVELOPMENT_ENVIRONMENT = "development";
const PRODUCTION_ENVIRONMENT = "production";

const REAL_OUTBOUND_PROVIDER_KEYS = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "EXPO_ACCESS_TOKEN",
] as const;

export type EnvironmentValues = Record<string, string | undefined>;

export interface DatabaseIdentity {
  host: string;
  port: string;
  username: string;
  database: string;
  projectReference: string | null;
  canonical: string;
}

export class DatabaseSafetyError extends Error {
  constructor(reason: string) {
    super(`Unsafe database configuration: ${reason}`);
    this.name = "DatabaseSafetyError";
  }
}

function reject(reason: string): never {
  throw new DatabaseSafetyError(reason);
}

function requiredValue(env: EnvironmentValues, name: string): string {
  const value = env[name]?.trim();
  if (!value) reject(`${name} is required`);
  return value;
}

function environmentIsProduction(env: EnvironmentValues): boolean {
  return env.APP_ENV === PRODUCTION_ENVIRONMENT || env.NODE_ENV === PRODUCTION_ENVIRONMENT;
}

function productionFingerprints(env: EnvironmentValues): string[] {
  return (env.PRODUCTION_DATABASE_FINGERPRINTS ?? env.PRODUCTION_DATABASE_FINGERPRINT ?? "")
    .split(/[,\n]/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function identityCandidates(identity: DatabaseIdentity): string[] {
  return [
    identity.host,
    identity.username,
    identity.database,
    identity.projectReference ?? "",
    identity.canonical,
  ].filter(Boolean);
}

function matchesIdentifier(identity: DatabaseIdentity, identifier: string): boolean {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  if (!normalizedIdentifier) return false;
  return identityCandidates(identity).some(
    (candidate) => candidate === normalizedIdentifier || candidate.includes(normalizedIdentifier),
  );
}

function rejectConfiguredProductionTarget(identity: DatabaseIdentity, env: EnvironmentValues): void {
  const fingerprints = productionFingerprints(env);
  if (fingerprints.some((fingerprint) => matchesIdentifier(identity, fingerprint))) {
    reject("target matches a configured production database fingerprint");
  }
}

export function parseDatabaseIdentity(connectionString: string): DatabaseIdentity {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    reject("database URL is invalid");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    reject("database URL must use PostgreSQL");
  }

  const host = parsed.hostname.toLowerCase();
  const port = parsed.port || "5432";
  let username: string;
  let database: string;
  try {
    username = decodeURIComponent(parsed.username).toLowerCase();
    database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")).toLowerCase();
  } catch {
    reject("database identity is invalid");
  }

  if (!host || !database) reject("database identity is incomplete");

  const supabaseProjectMatch = host.match(/^db\.([a-z0-9-]+)\.supabase\.co$/);
  const projectReference = supabaseProjectMatch?.[1] ?? null;
  const canonical = `host=${host};port=${port};user=${username};db=${database}`;

  return { host, port, username, database, projectReference, canonical };
}

export function getTestDatabaseUrl(env: EnvironmentValues = process.env): string {
  if (environmentIsProduction(env)) {
    reject("database tests cannot run in a production environment");
  }
  if (env.APP_ENV !== TEST_ENVIRONMENT) {
    reject("APP_ENV must be test");
  }
  if (env.ALLOW_DATABASE_TESTS !== "true") {
    reject("ALLOW_DATABASE_TESTS must be true");
  }

  const connectionString = requiredValue(env, "TEST_DATABASE_URL");
  const testDatabaseId = requiredValue(env, "TEST_DATABASE_ID");
  const identity = parseDatabaseIdentity(connectionString);

  rejectConfiguredProductionTarget(identity, env);
  if (!matchesIdentifier(identity, testDatabaseId)) {
    reject("target does not match the verified disposable database identifier");
  }

  return connectionString;
}

export function assertSafeDevelopmentDatabaseEnvironment(
  env: EnvironmentValues = process.env,
): string {
  if (environmentIsProduction(env)) {
    reject("database commands cannot run in a production environment");
  }
  if (env.APP_ENV !== DEVELOPMENT_ENVIRONMENT) {
    reject("APP_ENV must be development for database commands");
  }

  const connectionString = requiredValue(env, "DATABASE_URL");
  const developmentDatabaseId = requiredValue(env, "DEVELOPMENT_DATABASE_ID");
  const identity = parseDatabaseIdentity(connectionString);

  rejectConfiguredProductionTarget(identity, env);
  if (!matchesIdentifier(identity, developmentDatabaseId)) {
    reject("target does not match the verified development database identifier");
  }

  return connectionString;
}

export function getRuntimeDatabaseUrl(env: EnvironmentValues = process.env): string {
  if (env.APP_ENV === TEST_ENVIRONMENT || env.NODE_ENV === TEST_ENVIRONMENT) {
    assertSafeTestOutboundEnvironment(env);
    return getTestDatabaseUrl(env);
  }

  const connectionString =
    environmentIsProduction(env)
      ? env.SUPABASE_DATABASE_URL ?? env.DATABASE_URL
      : env.DATABASE_URL;

  if (!connectionString?.trim()) {
    reject(
      environmentIsProduction(env)
        ? "a production database URL is not configured"
        : "DATABASE_URL is required outside production",
    );
  }

  return connectionString;
}

export function isTestEnvironment(env: EnvironmentValues = process.env): boolean {
  return env.APP_ENV === TEST_ENVIRONMENT || env.NODE_ENV === TEST_ENVIRONMENT;
}

export function assertSafeTestOutboundEnvironment(
  env: EnvironmentValues = process.env,
): void {
  if (!isTestEnvironment(env)) return;

  if (env.APP_ENV !== TEST_ENVIRONMENT) {
    reject("APP_ENV must be test");
  }
  if (env.OUTBOUND_NOTIFICATIONS_MODE !== "mock") {
    reject("OUTBOUND_NOTIFICATIONS_MODE must be mock in tests");
  }

  const enabledProvider = REAL_OUTBOUND_PROVIDER_KEYS.find((key) => Boolean(env[key]?.trim()));
  if (enabledProvider) {
    reject(`real outbound provider ${enabledProvider} is enabled in tests`);
  }
}