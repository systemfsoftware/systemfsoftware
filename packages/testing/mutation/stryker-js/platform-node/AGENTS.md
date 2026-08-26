# AGENTS.md — `@systemfsoftware/stryker-js-platform-node`

> **Location:** `packages/testing/mutation/stryker-js/platform-node/` — Node host. One inert `Layer`. Workers are files, not specifiers.

This package is owned outright (`REPO-O1`).

Deltas from root:

- **No `stryker.config.json`.** Do not add a mutate list that mutates nothing.
- **`exports` is `.` and `./package.json` only.** Worker scripts are emitted and opened by URL. They are not public specifiers.
- **`makeRunLayer` is the public value.** Importing `.` performs no I/O.
- Rebuild (`pnpm build`) after any source change.
