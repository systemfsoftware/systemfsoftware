---
title: The workflow constructor boundary, not a filename, owns a decision
date: 2026-08-16
topic: architecture-patterns
---

# The workflow constructor boundary, not a filename, owns a decision

The organizing unit is the workflow constructor boundary: the brand (`WorkflowTypeId`, applied by
the body-bearing constructors `make` and `total`) forces every running decision through a
constructor, `Cell.decide` demands the brand, and the `workflow-make-boundary` Stryker ignorer
selects the mutation population from it.

## What owns a decision now

- **Purity and one-path inside a decision** — the `make` boundary. The compiler refuses an unbranded
  `decide`; `make-body-purity` and `workflow-match-exhaustive`
  (`@systemfsoftware/oxlint-plugin-effect-workflow`) are scoped to `Workflow.make` argument bodies; the
  mutation ignorer selects the population from the boundary.
- **I/O reachable from a pure phase body** — `no-io-in-phase-bodies`
  (`@systemfsoftware/oxlint-plugin-cell-vocabulary`). Its phase names, kind partition, and I/O
  classification are module-load projections of `Cell.vocabulary`, never literals in the rule, and an
  empty walked pure-phase set throws at load rather than passing.
- **Branching density** — oxlint's stock `complexity` rule in its `modified` variant, configured by
  `@systemfsoftware/all`: `max 1` for `**/src/**/*.workflow.ts`, `max 2` for the rest of `src`, tests
  exempt. The shell's "decides nothing" is owned by that complement ceiling and by review, never by a
  filename.
- **A hand-written `_tag` member** — `no-manual-tag-member`
  (`@systemfsoftware/oxlint-plugin-effect-schema`): a `_tag` property signature is refused in every type
  position, `.tst.ts` fixtures the only exclusion.
- **Where a schema may be declared** — `schema-declaration-location` and
  `schema-file-exports-schemas-only` (`@systemfsoftware/oxlint-plugin-effect-schema`): a module-scope
  schema lives in a `*.schema.ts` or in the owning `<stem>.workflow.ts`, and a schema file exports
  schemas only.
- **Top-level entrypoints** — `effect-entrypoint`
  (`@systemfsoftware/oxlint-plugin-effect-entrypoint`); its rules gate on the exact basename `main.ts`.
- **Duplicated generated laws** — `prop-generated-law-duplicate`
  (`@systemfsoftware/oxlint-plugin-property-testing`).

## What is unowned

An obligation with no mechanical channel behind it is carried by review alone, and this is the record
rather than an implication: nothing requires a module to declare a Description.

## Known bounds of the make-boundary selector

The `workflow-make-boundary` ignorer resolves named, aliased, and namespace imports whose source is the
literal `@systemfsoftware/effect-cell-types` module specifier, and follows same-file module-scope
function references. It does not follow re-export chains: a local module that re-exports `Workflow` and
a call site importing from that local module are outside the boundary, and the mutation population
shrinks accordingly — the re-export prohibition is a convention this records rather than a gate. The
`WorkflowBrand` is a phantom: it refuses accidents (a bare function handed to `Cell.decide`), not
adversaries — any legitimately branded value can donate the phantom by intersection, which is the
documented strength of every phantom mark (`phantom-marks-are-donatable.md`).

Since the 2026-09-12 widening, the ignorer recognizes `Workflow.total` as a second body-bearing
constructor and treats `Workflow.andThen` as a composing member: the member set names it a
constructor, but it opens no mutation population, because its operands are already-branded
workflow values, not decider bodies.
