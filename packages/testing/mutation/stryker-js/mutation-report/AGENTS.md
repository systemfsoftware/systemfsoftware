# AGENTS.md — `@systemfsoftware/stryker-js-mutation-report`

> **Location:** `packages/testing/mutation/stryker-js/mutation-report/` — ours, published from this repo.

This package owns every `PluginKind.Reporter` implementation in the engine (clear-text, progress, HTML, JSON, NDJSON-stream) plus their presentation dependencies (`chalk`, `progress`, `mutation-testing-elements`). It was split out of the engine package so that manifest no longer carries presentation deps. Each reporter is built by a `make*` factory and contributed as a `Layer` providing `Reporter`; there are no exported reporter classes.

Deltas from root:

- **No `stryker.config.json`, and do not add one** (root mutation rule — `check:mutate-scope`): every source file here is an adapter, and a shell-cell mutate glob over them is forbidden.
- **`src/stryker-plugins.ts` is load-bearing as an enumerated tsdown entry** — the plugin loader imports this subpath and reads the `strykerPlugins` export under its real name. Keep the enumerated entry and its re-export shape; do not fold it into the barrel.

🛑 Rebuild (`pnpm build`) after any source change in `mutation-report/` — an unbuilt edit tests the previous version (rationale: `packages/testing/mutation/stryker-js/AGENTS.md`).

🛑 Keep the `./stryker-plugins` subpath export — the CLI resolves it via `import.meta.resolve` and the plugin loader imports it.
