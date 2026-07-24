import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

// ── Startup schema migration — idempotent, safe to run on every boot ──────────
(async () => {
  try {
    await db.execute(drizzleSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token text`);
    logger.info("Schema migration: expo_push_token column ensured");
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

// Simple in-memory session store (MVP — replaced by token auth for mobile)
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

// Session middleware — token auth takes priority over cookie sessions
app.use((req, _res, next) => {
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
