---
'@systemfsoftware/oxlint-plugin-effect-workflow': major
'@systemfsoftware/oxlint-plugin-effect-dmmf': major
---

Thirteen `workflow-*` rules are removed, and with them two AST helpers that had no other consumer. `effect-workflow` now ships five rules; `effect-dmmf` re-exports the smaller set.

Removed: `workflow-single-function-export`, `workflow-command-object`, `workflow-declaration-form`, `workflow-schema-required`, `workflow-either-inhabited`, `workflow-typeid-required`, `workflow-typeid-shared-per-union`, `workflow-union-schema-declared`, `workflow-no-unconstructed-variant`, `workflow-no-throw`, `workflow-no-async`, `workflow-single-path`, `workflow-no-ambient-impurity`.

Kept: `workflow-no-panic-vocabulary`, `workflow-match-exhaustive`, `workflow-no-effect-import` and `workflow-property-test-shape` in `configs.recommended`, plus `workflow-inline-schemas` registered but not recommended.

Every removal carries a demonstration rather than a preference. A `*.workflow.ts` is emitted from a `*.workflow.decl.json`, and `guard-workflow-authorship` — wired through `gate:tasks`, so `check:local` and CI both carry it — fails any workflow cell that is hand-authored or hand-edited since emission. Each removed rule's violation was then attempted through the declaration, and the declaration refuses it by construction: `workflow-falsify.ts` reports the emitter's verbatim rejection for all thirteen. What survives is what a declaration passes through unexamined — an import edge, an identifier's vocabulary, the freedom of the emitted dispatch — plus one rule over hand-authored test files. All three reachable survivors were re-verified firing on a real probe after the removal.

Consumers spreading `configs.recommended` need no change; a config naming a removed rule by key must drop that key.
