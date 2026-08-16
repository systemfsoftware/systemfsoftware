---
title: Deleted the cell-role suffix rule fleet — the refusing channels are none
date: 2026-08-16
topic: architecture-patterns
---

# The thirteen-plugin deletion and its R13 ledger

`refactor(global)!: delete the cell-role suffix rule fleet` (2026-08-16) removed thirteen plugin packages — `cell-imports`, `cell-taxonomy`, `effect-acl`, `effect-adapter`, `effect-executor`, `effect-handler`, `effect-kernel`, `effect-middleware`, `effect-observer`, `effect-policy`, `effect-shape`, `effect-state`, `effect-store` — plus four `effect-workflow` rules and `effect-schema`'s `schema-exports-only-schemas` and `no-manual-tag-member`. What the deletion bought and cost, and the per-class re-attempt record the plan's R13 demands.

## What the deletion bought

- The sanctioned-suffix config is gone; no gate anywhere keys on a cell-role filename. The organizing unit is the `Workflow.make` boundary: the brand (`WorkflowTypeId`, applied only by `make`) forces every running decision through `make`, `Cell.decide` demands the brand, the one-path and purity rules key on the boundary, and the `workflow-make-boundary` Stryker ignorer selects the mutation population from it.
- The spike proved both unproven legs sound over the five production and adapter sites: the boundary walk (module-scope references followed, shadow-correct) and the reference classification (audited sealed table of pure imports per module, with honest `unresolvable` findings — no heuristic pass).
- Gate checks held the KTD4 line: `no-manual-tag-member` died (its gate reads the sanctioned `.shape.ts`); `no-schema-law-duplicate` survived (its gate is the property-test kind `*.property.test.ts`); `effect-entrypoint` survived whole (its rules gate on the `main.ts` basename, an entry convention the taxonomy never owned — the plugin's own AGENTS.md forbade adding it to the CELLS list).

## The R13 ledger — every channel is none

For each deleted plugin, one representative violation was re-attempted under workspace `tsc --strict` after the deletion: the violating code compiles clean. No compiler diagnostic, constructor, or import edge refuses any of it.

## The complement ceiling's extraction backlog

`no-domain-branching-density` ships at 17 — the lowest measured per-function McCabe complexity the whole tree passes with zero waivers (1441 branchable functions measured; max 17). The plan's provisional "never above 10" clause was superseded by that measurement: a ceiling the tree cannot pass is a gate that gets narrowed until it passes. The fifteen functions at 11-17 are the recorded extraction backlog — new branching has no legal home above the ceiling, and each incumbent is an extraction work item, never a waiver:

| CC | Location                                                                             | Function                |
| -- | ------------------------------------------------------------------------------------ | ----------------------- |
| 17 | packages/effect-schema-vite/src/mod.ts:89                                            | findExportedSchemaNames |
| 15 | omp/plugins/omp-claude-compat/src/internal/run-hooks-for-event.executor.ts:46        | (anonymous)             |
| 15 | packages/effect-memfs/src/index.ts:55                                                | makeFileInfo            |
| 14 | packages/effect-schema-vite/src/mod.ts:230                                           | walk                    |
| 14 | packages/stryker-js/cli/src/output-mode.kernel.ts:34                                 | resolveMode             |
| 14 | packages/stryker-js/cli/src/run-event-stream.adapter.ts:300                          | sink                    |
| 13 | omp/packages/omp-utils/src/tool-input.kernel.ts:40                                   | normalizeToolInput      |
| 13 | omp/plugins/omp-claude-compat/src/inject-instructions.executor.ts:22                 | (anonymous)             |
| 13 | packages/effect-schema-vite/src/mod.ts:55                                            | walk                    |
| 12 | omp/packages/omp-utils/src/tool-input.kernel.ts:90                                   | denormalizeToolInput    |
| 12 | omp/plugins/omp-claude-compat/src/hook-settings.acl.ts:221                           | onSome                  |
| 12 | packages/stryker-js/cli/src/llms-manifest.kernel.ts:292                              | describeCommandNode     |
| 11 | packages/effect-schema-law/src/weaken.kernel.ts:85                                   | walk                    |
| 11 | packages/stryker-js/cli/src/llms-manifest.kernel.ts:241                              | walkConfigNode          |
| 11 | packages/stryker-plugins/src/workflow-make-ignorer/make-boundary-ignore.kernel.ts:43 | workflowLocalNamesOf    |

## Known bounds of the make-boundary selector

The `workflow-make-boundary` ignorer resolves named, aliased, and namespace imports whose source is the literal `@systemfsoftware/effect-cell-types` module specifier, and follows same-file module-scope function references. It does not follow re-export chains: a local module that re-exports `Workflow` and a call site importing from that local module are outside the boundary, and the mutation population shrinks accordingly — the re-export prohibition is a convention this records rather than a gate. The `WorkflowBrand` is a phantom: it refuses accidents (a bare function handed to `Cell.decide`), not adversaries — any legitimately branded value can donate the phantom by intersection, which is the documented strength of every phantom mark (`phantom-marks-are-donatable.md`).

| Deleted plugin    | Representative violation re-attempted   | Refusing channel                                                                          |
| ----------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| cell-imports      | a banned cross-cell import              | none                                                                                      |
| cell-taxonomy     | a module file with no cell suffix       | none                                                                                      |
| effect-acl        | an `as` cast in an ACL                  | none                                                                                      |
| effect-adapter    | two external systems in one adapter     | none                                                                                      |
| effect-executor   | domain branching in an executor         | none (make-body-purity holds only `make` bodies; executor sequencing is exempt by design) |
| effect-handler    | a `switch` in a handler                 | none                                                                                      |
| effect-kernel     | a `throw` in a kernel; ambient impurity | none — the expected unowned class                                                         |
| effect-middleware | decode failure not gated                | none                                                                                      |
| effect-observer   | escaping state in an observer           | none                                                                                      |
| effect-policy     | error rewriting in a policy             | none                                                                                      |
| effect-shape      | behaviour in a shape                    | none                                                                                      |
| effect-state      | raw primitive exports in a state        | none                                                                                      |
| effect-store      | driver construction in a store          | none                                                                                      |

**Verdict: unowned, all of them.** This is the honest record, not a coverage claim. The taxonomy's obligations had no mechanical channel behind them — which is the measured reason they were deleted (0 of 44 recorded defects found by any lint rule; 24 by running something, 4 by the type checker). What is owned now: the `make` boundary owns purity and one-path inside decisions (compiler brand + lint rule + mutation gate); the shell's "decides nothing" is owned by the complement complexity ceiling and review, never by a filename.
