# AGENTS.md — `@systemfsoftware/stryker-js-mutation-run`

> **Location:** `packages/stryker-js/mutation-run/` — ours, published from this repo.

Ported from `@stryker-mutator/core`. The contribution gate lives in `@systemfsoftware/stryker-test-contribution`. The base preset turns it on.

Deltas from root:

- This package has no `mutate` list. Do not add a config that mutates nothing.

🛑 Rebuild (`pnpm build`) after any source change — an unbuilt edit tests the previous version (rationale: `packages/stryker-js/AGENTS.md`).

🛑 Keep the worker subpath exports (`./checker-worker`, `./child-process-proxy-worker`, `./child-process-test-runner-worker`); worker entrypoints resolve through them.
