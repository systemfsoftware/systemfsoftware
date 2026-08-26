# AGENTS.md — `@systemfsoftware/stryker-js`

> **Location:** `packages/testing/mutation/stryker-js/stryker-js/` — the mutation-testing language. Nine enumerated concept modules. No platform.

This package is owned outright (`REPO-O1`).

Deltas from root:

- **No `stryker.config.json`** — descriptions only; not enrolled in mutation.
- **Public specifiers are enumerated.** `tsdown.config.ts` owns `package.json#exports`. Never hand-edit exports. No wildcard. No `internal` specifier.
- **A plugin is a `Layer`.** `declarePlugin` lives on `./Plugin`. `SandboxDirectory` is a service, never `process.cwd()`.
- **The option set is one Effect Schema** on `./Schema`. The base preset is that entry's default export.
