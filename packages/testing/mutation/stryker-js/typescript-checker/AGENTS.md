# AGENTS.md — `@systemfsoftware/stryker-js-typescript-checker`

> **Location:** `packages/testing/mutation/stryker-js/typescript-checker/` — TypeScript checker plugin for Stryker, TS7-native.

Extends the `Checker` protocol exported by `@systemfsoftware/stryker-js` (see its `Checker` subpath), compiling projects directly with `typescript` against their own tsconfig (parsed via `@std/jsonc`). Built via tsdown, single entrypoint.

🛑 The checker compiles against its own `typescript` dependency, not one the host project supplies — `guardTSVersion` enforces `>=7.0.0` at runtime.
