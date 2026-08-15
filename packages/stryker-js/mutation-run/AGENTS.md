# AGENTS.md — `@systemfsoftware/stryker-js-mutation-run`

> **Location:** `packages/stryker-js/mutation-run/` — ours, published from this repo.

Ported from `@stryker-mutator/core`; it now carries behaviour the original has no equivalent for (`requireTestContribution`). Ours.

Deltas from root:

- **`mutate` names the decisions we wrote**, today `src/test-contribution.ts`. Name each new one as we take ownership of it; never narrow the list to lift a score. It is a literal path list on purpose — the Effect cell suffixes (`*.workflow.ts` and its siblings) get their meaning from the cell-taxonomy rules, and this package is exempt from those, so a suffix here would name a taxonomy nothing enforces.

🛑 Rebuild (`pnpm build`) after any source change — an unbuilt edit tests the previous version (rationale: `packages/stryker-js/AGENTS.md`).

🛑 Keep the worker subpath exports (`./checker-worker`, `./child-process-proxy-worker`, `./child-process-test-runner-worker`); worker entrypoints resolve through them.
