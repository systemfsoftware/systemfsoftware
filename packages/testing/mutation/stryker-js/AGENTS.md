# AGENTS.md — `packages/testing/mutation/stryker-js/`

The mutation-testing engine. Sub-package leaves (`cli/`, `instrumenter/`, `mutation-run/`, `mutation-report/`, `plugin-api/`, `typescript-checker/`, `vitest-runner/`) carry the per-package deltas.

- **These packages are ours, full stop (`REPO-O1`).** They began as a port of `@stryker-mutator`, which is history and never governance: we publish them, we change them, we do not contribute anything back, and we preserve mergeability with nothing. Refactor them like any other package in the workspace. Where a leaf holds to the originating project's strictness or idioms, that is a deliberate choice, not a constraint — and never a reason to call one of these packages a fork or to call anything upstream of it.
- **Rebuild (`pnpm build`) after any source change in `mutation-run/` or `mutation-report/`** — the CLI package and programmatic API users consume their built `dist/` (every export resolves through `./dist/*.mjs`), so an unbuilt edit tests the previous version.
