# AGENTS.md — `effect-dmmf/`

> Delta only. Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`. Universal rules: root `AGENTS.md`.

This package inline-merges three already-tested plugins (`property-testing`, `effect-executor`, `effect-workflow`) with a plain object spread in `src/index.ts`. It has no rule logic, no AST visitor, and no decision surface of its own — see `README.md#development`.

```yaml
- id: ED1
  title: No stryker, no vitest, no test files
  do: verify a change by building this package and running the built plugin against real oxlint (README.md#development)
  dont: add stryker.config.json, vitest.config.ts, tsconfig.node.json, any src/*.test.ts, or the vitest/stryker devDependencies back to this package
  harm: this package was built once WITH a dedicated behavior module, a mutation gate, and 12 synthetic-fixture tests covering scenarios that can never occur against three real, fixed, already-gated imports (arbitrary source counts, fake duplicate rule names) — that was MG1 (packages/oxlint-plugins/AGENTS.md) cargo-culted onto code with no real decision surface, and it was deleted; reintroducing it repeats the exact rework
  check: node scripts/guard-no-test-infra.mjs — wired into this package's own `lint` script, so it runs on every `pnpm check`; fails loud, names every violation found

- id: ED2
  title: ED1 holds only while this package stays a pure re-export
  do: re-derive from packages/oxlint-plugins/AGENTS.md#MG1 the moment src/index.ts gains a rule file, a filter/validation branch, or any logic a mutation could get wrong
  dont: read ED1 as a permanent "no tests ever" — it is scoped to the current shape, not the package forever
  harm: treating ED1 as permanent would exempt real future behavior from the family's actual gate
  check: review — a PR adding logic beyond spreads/lookups to src/index.ts restores mutation coverage; guard-no-test-infra.mjs cannot make this call, it only enforces the current shape
```
