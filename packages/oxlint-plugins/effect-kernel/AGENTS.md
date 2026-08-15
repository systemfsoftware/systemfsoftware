# AGENTS.md — `effect-kernel/`

> Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`.

Rules here gate `*.kernel.ts` — vocabulary-free, domain-blind, pure behavior.

```yaml
- id: KK1
  title: Lint gates only — the rest is review
  do: decide mechanically the two constraints this package owns — purity (no Effect run surface) and the absence of domain imports; leave vocabulary, dispatch form, and property-test coverage to review and mutation gates; every rule this package registers MUST enforce one of the two mechanically-decided constraints
  dont: approximate vocabulary with identifier-name heuristics — a kernel that merely passes the linter while naming domain nouns is worse than no gate
  harm: a false sense of enforcement trains authors to ignore the review gate
  check: review — every rule in this package is inert outside *.kernel.ts and decides only what this package implements

- id: KK2
  title: Constructing an Effect is pure; running it is not
  do: ban only the run surface (Effect.run*, Run.run, Runtime.run*) in *.kernel.ts
  dont: NEVER ban the effect barrel or effect/Effect imports — a kernel imports library primitives and builds Effect descriptions
  harm: banning the import bans the pure construction the purity constraint explicitly allows, and the rule stops being a purity gate
  check: '`grep -qE "Effect\.gen|from ''effect''" src/rules/__tests__/kernel-no-effect-runtime.test.ts` — valid cases import effect and build Effect.gen descriptions'
```
