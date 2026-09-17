---
name: Query boolean normalization
description: Non-obvious behavior when generated Zod schemas coerce Express query-string booleans
---

Explicit query-string booleans must be normalized before they reach generated Zod schemas that use `z.coerce.boolean()`.

**Why:** JavaScript treats every non-empty string as truthy, so `Boolean("false")` becomes `true`; an `isActive=false` API request can silently return active records instead of inactive records.

**How to apply:** For query parameters with boolean semantics, map the exact string values `"true"` and `"false"` to booleans before schema parsing, and keep a regression test for both values.