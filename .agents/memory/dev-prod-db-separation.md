---
name: Dev vs prod DBs
description: Both dev and production now use the same Supabase database via SUPABASE_DATABASE_URL.
---

**Current state (post-Supabase migration):** Both dev and production use Supabase via `SUPABASE_DATABASE_URL`.

The DB connection in `lib/db/src/index.ts` uses `SUPABASE_DATABASE_URL ?? DATABASE_URL`. Since `SUPABASE_DATABASE_URL` is a Replit secret (global, available in both dev and production), both environments hit the same Supabase database.

**Why:** Production was already on Supabase with real data (22 users, 18 requests confirmed live) before this migration session. The Replit PostgreSQL `DATABASE_URL` is now only a fallback and holds stale dev data.

**How to apply:** Do not assume dev and production are on separate DBs. Any writes in dev go to the shared Supabase instance — use caution with test data. Do not use `executeSql({ environment: "production" })` to check prod data; instead query via the API or use `psql $SUPABASE_DATABASE_URL`.

**Supabase connection requirement:** Must use the Session-mode pooler URL (`*.pooler.supabase.com:5432`). The direct hostname (`db.*.supabase.co:5432`) is unreachable from Replit's sandbox — DNS is blocked.
