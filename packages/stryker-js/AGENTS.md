# AGENTS.md — `packages/stryker-js/`

The @systemfsoftware Stryker fork. Sub-package leaves (`cli/`, `mutation-run/`, `mutation-report/`, `plugin-api/`, `typescript-checker/`, `vitest-runner/`) carry the per-package deltas.

- **These packages are ours, full stop.** Ported from `@stryker-mutator`, but that is history, never governance: we publish them, we change them, we do not contribute back, and we do not preserve mergeability. Refactor them like any other package in the workspace. Where a leaf keeps the original project's strictness or idioms, that is a deliberate choice (CONSTITUTION §V.6), not a constraint.
- **Rebuild (`pnpm build`) after any source change in `mutation-run/` or `mutation-report/`** — the CLI package and programmatic API users consume their built `dist/` (every export resolves through `./dist/*.mjs`), so an unbuilt edit tests the previous version.
