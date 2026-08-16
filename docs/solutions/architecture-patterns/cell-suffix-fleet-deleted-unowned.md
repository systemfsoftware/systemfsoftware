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
