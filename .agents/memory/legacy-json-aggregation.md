---
name: Legacy JSON aggregation
description: Safe counting patterns for legacy JSON text columns on this PostgreSQL deployment
---

When aggregating data from legacy JSON text columns, do not rely on `pg_input_is_valid`; this PostgreSQL deployment does not provide that function. Keep database-side `COUNT/GROUP BY` aggregation for ordinary columns, and fetch only the minimal identifier plus JSON-text columns needed for safe application parsing and deduplication.

**Why:** A raw JSONB cast guarded by `pg_input_is_valid` caused a production-compatible local database query failure because the function was unavailable.

**How to apply:** Use the existing defensive JSON parser, filter values against the active catalog, and use sets for per-entity/per-area uniqueness. Never expose the minimal projection as user data.