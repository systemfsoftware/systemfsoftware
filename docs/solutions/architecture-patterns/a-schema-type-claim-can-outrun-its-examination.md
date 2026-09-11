---
title: A schema type claim can outrun its examination, and nothing here refuses it
date: 2026-09-11
category: architecture-patterns
module: workspace-wide
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - auditing what actually refuses a payload whose type says it is refused
  - building a gate over schema authoring or boundary decoding
  - deleting an instrument whose guarantee was only ever partial
tags:
  - typescript
  - type-level-enforcement
  - boundary
  - verification-gap
  - effect-ts
---

# A schema type claim can outrun its examination, and nothing here refuses it

## Context

This record is addressed to the instrument owner. A schema's type says what a value must be; a schema's checks decide whether anything was done about it. The two can diverge, and when they do, the compiler stays green. This workspace's foreign-data boundary marker was deleted on 2026-09-11 because its guarantee was donatable (`phantom-marks-are-donatable.md`); this page records the hole its deletion left open and the forms of unexamined type claim that were never refused by anything, before or since.

Building the command that would refuse these forms is outside the deleted work and outside this record — an Evaluator surface is built by its own owner, in its own commit, not by the work it would grade.

## The forms

| # | Form of type claim                                                                                                                                                                                                                                                                       | Live instance in this workspace                                                                                                                                                                                     | Refusing channel                                                                                                                                                           |
| - | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | The unchecked cast: an `as` (or `as unknown as`) asserts a shape nothing verified                                                                                                                                                                                                        | `packages/stryker-js/stryker-js-instrumenter/src/Parser.ts:130` — `result.program as unknown as Program`, and throughout `src/print/index.ts`                                                                       | `typescript/no-unsafe-type-assertion` refuses it except under a suppression comment; the live instance carries exactly such a comment, so nothing refuses the shipped form |
| 2 | The check-skipping constructor option: the generated default constructors accept a documented option that trusts the input and skips member checks, and the vendor documentation recommends it whenever the author trusts the data — a judgement no type can make on the author's behalf | None found in the surfaces searched; the form is one option away at any call site                                                                                                                                   | None                                                                                                                                                                       |
| 3 | The declared type with an inadequate predicate: `Schema.declare` publishes a type whose predicate admits far more than the type says                                                                                                                                                     | `packages/stryker-js/stryker-js-vitest-runner/src/Runner.schema.ts:59-62` — declares "the project-local vitest/node module" with a predicate that admits any object                                                 | None                                                                                                                                                                       |
| 4 | Unknown admitted at a boundary: a record or rest member typed `Unknown` passes any payload into a position the surrounding type treats as shaped                                                                                                                                         | `packages/stryker-js/stryker-js-engine/src/Config.schema.ts:5` (`ConfigDocumentSchema`), and every `StructWithRest` rest member (for example `openStruct` in `packages/stryker-js/stryker-js/src/Schema.schema.ts`) | None — the admission is deliberate; plugin keys and config documents are unknown-shaped by design                                                                          |
| 5 | The zero-filter brand: `S.brand` applies a nominal tag with no runtime filter, so a branded type claims a distinction nothing checks                                                                                                                                                     | None found as shipped production code; the form is one unfiltered `S.brand('Name')` away (the ecosystem's own examples are exactly that)                                                                            | None                                                                                                                                                                       |
| 6 | The deleted marker: a phantom intersection on a schema that claimed a foreign payload was declared here                                                                                                                                                                                  | Deleted with `packages/effect-cell-types/src/Wire.ts`; its five measured forgery routes live in `phantom-marks-are-donatable.md`                                                                                    | None                                                                                                                                                                       |

## What a gate could do with them

A text gate can refuse forms 1 and 2 outright: a cast is a syntactic event, and the skipping option is a named argument. Form 5 is nearly so — a brand with no filter in its pipe is detectable. Forms 3 and 4 are legal TypeScript and deliberate modelling; a gate can only require justification for them, because the form is not the defect — the predicate's adequacy is, and no textual rule can measure that. Form 6 is a design decision, not a lint finding.

## What the deletion gave up

Until 2026-09-11, a raw vendor schema dropped directly into a wire-declared struct field failed to compile. That refusal was donatable and therefore weaker than it looked, but it was real for the accidental case, and it was the only refusal in this list that ever existed. Nothing replaces it.

## Verdict

Unowned, all of them. This is the honest record, not a coverage claim: the surfaces searched were the guard directory, the root script chain, the lint rule inventory, and a workspace source search per form; absence of a firing outside those surfaces is not proven.

## Related

- `docs/solutions/architecture-patterns/phantom-marks-are-donatable.md` — why the deleted marker could not certify what it claimed
- `docs/solutions/architecture-patterns/cell-suffix-fleet-deleted-unowned.md` — the precedent shape for recording a deleted instrument's uncovered obligation
- `docs/solutions/architecture-patterns/constraint-reaches-only-via-window-or-gate.md` — why this record is a window, not a gate: it binds only where an author actually reads it
