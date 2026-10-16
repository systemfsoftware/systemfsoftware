---
title: The workflow constructor boundary, not a filename, owns a decision
date: 2026-08-16
topic: architecture-patterns
problem_type: architecture_pattern
---

# The workflow constructor boundary, not a filename, owns a decision

The organizing unit is the workflow constructor boundary: the brand (`WorkflowBrand`, applied by the constructor `make`) forces every running decision through a
constructor, and the `Sandwich` chain's `decide` step demands the brand.

## What owns a decision now

- **Purity and one-path inside a decision** — the `make` boundary. The compiler refuses an unbranded
  `decide`; `make-body-purity` and `workflow-match-exhaustive`
  (`@systemfsoftware/oxlint-plugin-dmmf-workflow`) are scoped to `Workflow.make` argument bodies.
- **Branching density** — oxlint's stock `complexity` rule in its `modified` variant: `max 1` for
  `**/src/**/*.workflow.ts` (`@systemfsoftware/oxlint-plugin-dmmf-workflow`'s recommended overrides) and
  `max 2` for the rest of `src` (`@systemfsoftware/oxlint-config-dmmf`), tests exempt. The shell's
  "decides nothing" is owned by that complement ceiling and by review, never by a filename.
- **A hand-written `_tag` member** — `no-manual-tag-member`
  (`@systemfsoftware/oxlint-plugin-effect-schema`): a `_tag` property signature is refused in every type
  position, `.tst.ts` fixtures the only exclusion.
- **Where a schema may be declared** — `schema-declaration-location` and
  `schema-file-exports-schemas-only` (`@systemfsoftware/oxlint-plugin-effect-schema`): a module-scope
  schema lives in a `*.schema.ts` or in the owning `<stem>.workflow.ts`, and a schema file exports
  schemas only.
- **Top-level entrypoints** — the `entrypoint-*` rules
  (`@systemfsoftware/oxlint-plugin-effect-platform`); they gate on the exact basename `main.ts`.
- **Duplicated generated laws** — `prop-generated-law-duplicate`
  (`@systemfsoftware/oxlint-plugin-test-discipline`).

## What is unowned

An obligation with no mechanical channel behind it is carried by review alone, and this is the record
rather than an implication: nothing requires a module to declare a Description, and nothing refuses I/O
reachable from a pure phase body since `no-io-in-phase-bodies` left with `Cell.vocabulary` (#423).

## Known bounds of the make-boundary selector (history)

Until the Stryker fork left this repository (#429), the `workflow-make-boundary` mutation ignorer selected
the mutation population from this boundary; no mutation config here uses it now. It resolved named, aliased, and namespace imports whose source is the
literal `@systemfsoftware/effect-cell-types` module specifier, and follows same-file module-scope
function references. It does not follow re-export chains: a local module that re-exports `Workflow` and
a call site importing from that local module are outside the boundary, and the mutation population
shrinks accordingly — the re-export prohibition is a convention this records rather than a gate. The
`WorkflowBrand` is a phantom: it refuses accidents (a bare function handed to `Cell.decide`), not
adversaries — any legitimately branded value can donate the phantom by intersection, which is the
documented strength of every phantom mark (`phantom-marks-are-donatable.md`).

The ignorer keyed on the `Workflow.make` boundary: `make` is the sole workflow constructor, declaring its schemas and decider options. `@systemfsoftware/oxlint-make-boundary` still mirrors its constants for the lint rules above.
