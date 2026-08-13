# AGENTS.md — `@systemfsoftware/stryker-js-mutation-report`

> **Location:** `packages/stryker-js/mutation-report/` — ours, published from this repo. Universal agent rules live in the root `AGENTS.md`; this file carries only `stryker-js-mutation-report/`-specific deltas.

This package owns every `PluginKind.Reporter` implementation of the fork (clear-text, progress, HTML, JSON, NDJSON-stream) plus their presentation dependencies (`chalk`, `progress`, `mutation-testing-elements`). It was split out of `packages/stryker-js/mutation-run/` in U6 so the engine's manifest no longer carries presentation deps. The reporters are upstream-shaped fork code — refactor them like any other package here.

Deltas from root:

- **No `stryker.config.json`, and do not add one** (root mutation rule — `check:mutate-scope`): every source file here is an adapter, and a shell-cell mutate glob over them is forbidden.
- **`src/stryker-plugins.ts` is load-bearing as an enumerated tsdown entry** — the plugin loader imports this subpath and reads the `strykerPlugins` export under its real name. Keep the enumerated entry and its re-export shape; do not fold it into the barrel.

🛑 Rebuild (`pnpm build`) after any source change — the CLI package consumes this package's built `dist/` (every export resolves through `./dist/*.mjs`), so an unbuilt edit tests the previous version.

🛑 Keep the `./stryker-plugins` subpath export — the CLI resolves it via `import.meta.resolve` and the plugin loader imports it.
