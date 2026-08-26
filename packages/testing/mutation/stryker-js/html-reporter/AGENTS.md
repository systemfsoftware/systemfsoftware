# AGENTS.md — `@systemfsoftware/stryker-js-html-reporter`

> **Location:** `packages/testing/mutation/stryker-js/html-reporter/` — HTML reporter. Carries `mutation-testing-elements`.

This package is owned outright (`REPO-O1`).

Deltas from root:

- **No `stryker.config.json`.** Adapter only.
- **Exports `.` and `./package.json` only.** No `./stryker-plugins` specifier.
- Rebuild (`pnpm build`) after any source change.
