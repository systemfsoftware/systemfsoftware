---
'@systemfsoftware/oxlint-plugin-effect-workflow': major
'@systemfsoftware/oxlint-plugin-effect-dmmf': major
---

Thirteen `workflow-*` rules are removed, and with them two AST helpers that had no other consumer. `effect-workflow` now ships five rules; `effect-dmmf` re-exports the smaller set.

Removed: `workflow-single-function-export`, `workflow-command-object`, `workflow-declaration-form`, `workflow-schema-required`, `workflow-either-inhabited`, `workflow-typeid-required`, `workflow-typeid-shared-per-union`, `workflow-union-schema-declared`, `workflow-no-unconstructed-variant`, `workflow-no-throw`, `workflow-no-async`, `workflow-single-path`, `workflow-no-ambient-impurity`.

Kept: `workflow-no-panic-vocabulary`, `workflow-match-exhaustive`, `workflow-no-effect-import` and `workflow-property-test-shape` in `configs.recommended`, plus `workflow-inline-schemas` registered but not recommended.

Every removal names what refuses the violation instead. Three are refused by `Workflow.make`'s own constructor types, which reject a workflow whose error channel is `never` (`__WORKFLOW_ERROR_CHANNEL_IS_NEVER__`), one whose decision channel is (`__WORKFLOW_DECISION_CHANNEL_IS_NEVER__`), and an error carrying no `_tag` to dispatch on (`__WORKFLOW_ERROR_CHANNEL_CARRIES_NO_TAG__`) — the diagnostic arrives at the construction site, names its own fix, and travels to consumers through the type rather than through an installed lint config. Five more are compiler diagnostics already at `error` in `packages/tsconfig/effect.json`: `asyncFunction` covers `workflow-no-async`, and `globalFetchInEffect`, `globalDateInEffect`, `globalRandomInEffect` and `processEnvInEffect` cover `workflow-no-ambient-impurity`. What survives as a lint rule is what neither mechanism can see: an import edge, an identifier's vocabulary, and one rule over hand-authored test files.

The remaining removals are deliberately unenforced rather than re-homed. `workflow-no-throw` and the declaration-shape rules asserted properties no type refuses and no diagnostic reports, and each was keyed on a filename, so it never fired on the violation it existed to catch. `docs/2026-08-15-orphaned-cell-constraints.md` records every one with what owning it would take.

Consumers spreading `configs.recommended` need no change; a config naming a removed rule by key must drop that key.
