# AGENTS.md — `@systemfsoftware/stryker-js-mutation-run`

> **Location:** `packages/stryker-js/mutation-run/` — ours, published from this repo. Universal agent rules live in the root `AGENTS.md`; this file carries only `stryker-js-mutation-run/`-specific deltas.

It began as `@stryker-mutator/core` and has diverged: TS7 deleted APIs it relied on, and it now carries behaviour upstream has no equivalent for (`requireTestContribution`). There is no merge back. "Upstream" names where this came from, never a limit on changing it — refactor it like any other package here.

Deltas from root:

- **Lint is baseline oxlint, not the cell config** — `scripts/check-lint-coverage.mjs` records the exemption and its reason. `pnpm --filter @systemfsoftware/stryker-js-mutation-run lint` still has to pass.
- **`mutate` names the decisions we wrote**, today `src/test-contribution.ts`. Name each new one as we take ownership of it; never narrow the list to lift a score. It is a literal path list on purpose — the Effect cell suffixes (`*.workflow.ts` and its siblings) get their meaning from the cell-taxonomy rules, and this package is exempt from those, so a suffix here would name a taxonomy nothing enforces.

🛑 Rebuild (`pnpm build`) after any source change — the CLI package and programmatic API users consume this package's built `dist/` (every export resolves through `./dist/*.mjs`), so an unbuilt edit tests the previous version.

🛑 Keep the worker subpath exports (`./checker-worker`, `./child-process-proxy-worker`, `./child-process-test-runner-worker`); worker entrypoints resolve through them.
