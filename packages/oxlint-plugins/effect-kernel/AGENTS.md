# AGENTS.md — `effect-kernel/`

> Delta only. Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`. Universal rules: root `AGENTS.md`.

Rules here gate the `architect-kernel` cell spec — vocabulary-free, domain-blind, PURE behavior. The cell skill (`skill://architect-kernel`, gates KE1–KE6) is the spec of record; read it for what a valid `*.kernel.ts` is. Restating it here would create a second copy that drifts.

```yaml
- id: KK1
  title: Lint gates only — review gates live in the skill
  do: implement KE1 (purity) and KE2 (no domain imports) mechanically; leave KE3 (vocabulary), KE4 (dispatch), and KE5 (property tests) to review and mutation gates; every rule this package registers MUST map to KE1, KE2, or KE6
  dont: approximate KE3/KE4 with identifier-name heuristics — a kernel that merely passes the linter while naming domain nouns is worse than no gate
  harm: a false sense of enforcement trains authors to ignore the real gate
  check: every rule in this package maps to KE1, KE2, or KE6 and is inert outside *.kernel.ts

- id: KK2
  title: Constructing an Effect is pure; running it is not
  do: ban only the run surface (Effect.run*, Run.run, Runtime.run*) in *.kernel.ts
  dont: NEVER ban the effect barrel or effect/Effect imports — a kernel imports library primitives and builds Effect descriptions
  harm: banning the import bans the pure construction KE1 explicitly allows, and the rule stops being a purity gate
  check: kernel-no-effect-runtime has valid cases importing effect and building Effect.gen descriptions
```
