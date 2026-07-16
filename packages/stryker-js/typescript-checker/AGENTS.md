# AGENTS.md — `@systemfsoftware/stryker-js-typescript-checker`

> **Delta**: TypeScript checker plugin for Stryker, TS7-native. Root AGENTS.md governs all work.

Extends `@stryker-mutator/api` checker protocol. Imports from `@systemfsoftware/stryker-js-core` for worker infrastructure. Built via tsdown, single entrypoint.

🛑 **Don't** depend on `typescript` from the host project — peer dep resolved at runtime.
