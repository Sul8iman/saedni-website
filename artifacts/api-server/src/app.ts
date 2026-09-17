import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { assertSafeTestOutboundEnvironment } from "@workspace/db/test-safety";
import router from "./routes";
import { logger } from "./lib/logger";

assertSafeTestOutboundEnvironment();

// ── Startup schema migration — idempotent, safe to run on every boot ──────────
(async () => {
  try {
    await db.execute(drizzleSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token text`);
    await db.execute(drizzleSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS helper_welcome_message_sent_at timestamptz`);
    await db.execute(drizzleSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS helper_welcome_message_lease_id text`);
    await db.execute(drizzleSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS helper_welcome_message_lease_expires_at timestamptz`);
    await db.execute(drizzleSql`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS event_key text`);
    await db.execute(drizzleSql`CREATE UNIQUE INDEX IF NOT EXISTS admin_notifications_event_key_unique ON admin_notifications(event_key)`);
    await db.execute(drizzleSql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS deleted_at timestamptz`);
    await db.execute(drizzleSql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS deleted_by_user_id integer`);
    await db.execute(drizzleSql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS deleted_reason text`);
    await db.execute(drizzleSql`
      CREATE TABLE IF NOT EXISTS request_lifecycle_events (
        id serial PRIMARY KEY,
        request_id integer NOT NULL,
        action text NOT NULL,
        actor_user_id integer,
        actor_role text,
        reason text,
        metadata text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(drizzleSql`
      CREATE INDEX IF NOT EXISTS request_lifecycle_events_request_created_at_idx
      ON request_lifecycle_events(request_id, created_at)
    `);
    await db.execute(drizzleSql`
      CREATE INDEX IF NOT EXISTS requests_active_created_at_idx
      ON requests(created_at) WHERE deleted_at IS NULL
    `);
    logger.info("Schema migration: runtime columns ensured");
  } catch (err) {
    logger.warn({ err }, "Schema migration check failed (non-fatal)");
  }
})();

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.SESSION_SECRET ?? "saidni_secret"));

// Simple in-memory session store. Bearer tokens are preferred for mobile, but
// the signed cookie keeps already-installed clients working while they upgrade.
const sessions: Record<string, { userId?: number }> = {};

// Token-based auth middleware — reads Authorization: Bearer <token> header
// and resolves the user from DB, making the request immune to server restarts.
app.use(async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        const [user] = await db
          .select({ id: usersTable.id, isBlocked: usersTable.isBlocked })
          .from(usersTable)
          .where(eq(usersTable.authToken, token));
        if (user) {
          (req as any)._tokenUserId = user.id;
          (req as any)._tokenIsBlocked = user.isBlocked;
        }
      } catch (err) {
        logger.warn({ err }, "Token lookup failed");
      }
    }
  }
  next();
});

// Session middleware — token auth takes priority over cookie sessions.
// Persist newly-created sessions so legacy mobile clients that use cookies can
// still access protected admin routes after a successful PIN login.
app.use((req, res, next) => {
  const tokenUserId = (req as any)._tokenUserId;
  if (tokenUserId != null) {
    (req as any).session = { userId: tokenUserId };
    next();
    return;
  }

  const sid = (req as any).signedCookies?.sid || req.cookies?.sid;
  if (sid && sessions[sid]) {
    (req as any).session = sessions[sid];
  } else {
    const newSid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessions[newSid] = {};
    (req as any).session = sessions[newSid];
    (req as any).sessionId = newSid;
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("sid", newSid, {
      httpOnly: true,
      signed: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
  next();
});

app.use("/api", router);

// Global JSON error handler — must be last; converts all unhandled Express errors
// to JSON so mobile clients can parse the message (no more HTML 500 pages).
app.use(
  (
    err: unknown,
    _req: import("express").Request,
    res: import("express").Response,
    _next: import("express").NextFunction,
  ) => {
    const message =
      err instanceof Error ? err.message : "خطأ داخلي في الخادم";
    logger.error({ err }, "Unhandled route error");
    res.status(500).json({ error: "خطأ داخلي في الخادم", detail: message });
  },
);

export default app;
