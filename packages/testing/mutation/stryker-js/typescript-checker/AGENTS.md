# AGENTS.md — `@systemfsoftware/stryker-js-typescript-checker`

> **Location:** `packages/testing/mutation/stryker-js/typescript-checker/` — TypeScript checker plugin for Stryker, TS7-native.

Extends `@systemfsoftware/stryker-js-plugin-api` checker protocol, compiling projects directly with `typescript` against their own tsconfig (parsed via `@std/jsonc`). Built via tsdown, single entrypoint.

🛑 Don't depend on `typescript` from the host project — peer dep resolved at runtime.
