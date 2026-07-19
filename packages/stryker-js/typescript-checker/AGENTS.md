# AGENTS.md — `@systemfsoftware/stryker-js-typescript-checker`

> **Location:** `packages/stryker-js/typescript-checker/` — TypeScript checker plugin for Stryker, TS7-native. Universal agent rules live in the root `AGENTS.md`; this file carries only `typescript-checker/`-specific deltas.

Extends `@stryker-mutator/api` checker protocol. Imports from `@systemfsoftware/stryker-js-core` for worker infrastructure. Built via tsdown, single entrypoint.

🛑 Don't depend on `typescript` from the host project — peer dep resolved at runtime.
