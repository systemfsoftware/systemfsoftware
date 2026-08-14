# AGENTS.md — `packages/stryker-js/`

The @systemfsoftware Stryker fork. Sub-package leaves (`cli/`, `mutation-run/`, `mutation-report/`, `plugin-api/`, `typescript-checker/`, `vitest-runner/`) carry the per-package deltas.

- **"Upstream" names where this came from, never a limit on changing it.** Every package here is ours: we publish it, we change it — refactor them like any other package in the workspace. `mutation-run/` has diverged too far for a merge back; `plugin-api/` keeps one additive divergence intended for upstream. Where a leaf reproduces upstream's strictness or idioms (CONSTITUTION §V.6), that is a deliberate choice, not a constraint.
- **Rebuild (`pnpm build`) after any source change in `mutation-run/` or `mutation-report/`** — the CLI package and programmatic API users consume their built `dist/` (every export resolves through `./dist/*.mjs`), so an unbuilt edit tests the previous version.
