---
name: Artifact production build environment
description: Environment requirements and port conflicts that affect standalone artifact builds in this monorepo.
---

Standalone Vite artifact builds require both `PORT` and `BASE_PATH`; the development workflows provide them automatically, but direct workspace builds do not. The mobile static export starts Metro on port 8081, so it must not run concurrently with the mockup preview on that port.

**Why:** Full workspace builds otherwise fail before compiling application code, and the Expo export can interpret the occupied port as an interactive port-selection prompt in non-interactive CI.

**How to apply:** For direct builds, provide the artifact’s intended port and base path. Temporarily stop the mockup preview before the mobile export, then restore it afterward. This is local build orchestration only; do not change product workflow ports just to make a one-off validation pass.