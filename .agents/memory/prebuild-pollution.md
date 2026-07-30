---
name: Expo prebuild package.json pollution
description: expo prebuild mutates package.json by injecting expo/react/react-native into dependencies — these mutations must never be committed.
---

## The rule

After any `expo prebuild` run, **always discard `package.json` before committing**:

```bash
git checkout -- artifacts/saedni-mobile/package.json
```

## Why

`expo prebuild` automatically appends `expo ~54.0.35`, `react 19.1.0`, and
`react-native 0.81.5` to the `dependencies` block of `package.json`. These
packages are already declared in `devDependencies` (`react` as `catalog:`,
the others as explicit versions). The lockfile was built against `catalog:`
for react; the injected explicit `19.1.0` conflicts, causing
`pnpm install --frozen-lockfile` to fail on EAS with:

  ERR_PNPM_FROZEN_LOCKFILE  Lockfile is not up to date

**Why:** EAS runs `pnpm install --frozen-lockfile` in a clean environment.
Any drift between the committed `package.json` and `pnpm-lock.yaml` is fatal.

## How to apply

- Use `expo prebuild` only to inspect generated native files
  (`AndroidManifest.xml`, `MainActivity.kt`, etc.).
- The `package.json` output of prebuild is noise — never stage it.
- Before every `git add`, run `git diff artifacts/saedni-mobile/package.json`
  and confirm no `expo`/`react`/`react-native` appeared in `dependencies`.
- If they did appear, run `git checkout -- artifacts/saedni-mobile/package.json`
  to restore the clean state.

## Correct `dependencies` block

```json
"dependencies": {
  "@react-native-community/datetimepicker": "^8.4.4",
  "expo-localization": "~17.0.9",
  "expo-notifications": "~0.29.14",
  "expo-secure-store": "^15.0.8"
}
```

`expo`, `react`, and `react-native` belong only in `devDependencies`.
