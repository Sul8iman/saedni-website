---
name: EAS Android build workflow
description: Environment-specific EAS CLI invocation and Android build-history limits for Saedni release builds.
---

Use the project-local EAS CLI through the mobile package rather than the workspace root, because the root does not expose the `eas` binary. EAS build history accepts a maximum `--limit 50`; larger values fail before returning JSON.

**Why:** Release verification initially used the root command and an over-large history limit, while the project-local CLI and 50-row query worked reliably.

**How to apply:** Build from a clean worktree at the target `saedni/main` commit, query Android history with `pnpm --filter @workspace/saedni-mobile exec eas build:list --platform android --limit 50 --json`, and use the production profile’s version-code auto-increment after confirming the next unused code.