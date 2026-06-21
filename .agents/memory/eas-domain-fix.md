---
name: EAS build domain configuration
description: EXPO_PUBLIC_DOMAIN must be bare hostname in eas.json — app code adds https:// prefix itself
---
In Expo native builds, `process.env.EXPO_PUBLIC_*` variables are baked in at build time from `eas.json`.
The app constructs BASE as: `https://${process.env.EXPO_PUBLIC_DOMAIN}` — so the eas.json value must be
the bare hostname WITHOUT any scheme. Setting it with `https://` causes `https://https://...` malformed URLs.

Production value: `saedni.onrender.com` (bare hostname, no https://).
Apple Team ID: `226T25Z67X` (not B — easy typo).
iOS buildNumber: "29" as of June 2026.

**How to apply:** Any time the production API URL changes, update `eas.json` > `build.production.env.EXPO_PUBLIC_DOMAIN`
with the bare hostname (no scheme), then trigger a new EAS build.
