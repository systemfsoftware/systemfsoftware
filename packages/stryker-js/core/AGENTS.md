# AGENTS.md — `@systemfsoftware/stryker-js-core`

> **Location:** `packages/stryker-js/core/` — ours, published from this repo. Universal agent rules live in the root `AGENTS.md`; this file carries only `stryker-js-core/`-specific deltas.

It began as `@stryker-mutator/core` and has diverged: TS7 deleted APIs it relied on, and it now carries behaviour upstream has no equivalent for (`requireTestContribution`). There is no merge back. "Upstream" names where this came from, never a limit on changing it — refactor it like any other package here.

Deltas from root:

- **Lint is baseline oxlint, not the cell config** — `scripts/check-lint-coverage.mjs` records the exemption and its reason. `pnpm --filter @systemfsoftware/stryker-js-core lint` still has to pass.
- **`mutate` covers only decisions we wrote**, today `src/reporters/test-contribution.ts`. Widen it when we take ownership of another decision; never narrow it to lift a score.

🛑 Rebuild (`pnpm build`) after any source change — the CLI package and programmatic API users consume core's built `dist/` (every export resolves through `./dist/*.mjs`), so an unbuilt edit tests the previous version.

🛑 Keep the worker subpath exports (`./checker-worker`, `./child-process-proxy-worker`, `./child-process-test-runner-worker`); worker entrypoints resolve through them.
