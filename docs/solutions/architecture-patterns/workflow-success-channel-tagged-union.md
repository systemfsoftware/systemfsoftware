---
title: Workflow Success Channel Must Be a Branded Tagged Union
date: 2026-09-03
category: architecture-patterns
module: effect-cell-types
component: workflow-decision-channel
problem_type: architecture-pattern
track: knowledge
severity: high
applies_when:
  - Authoring or editing a decision channel passed to Workflow.make
  - Migrating a workflow whose success channel is a single class, a plain record, or a bare scalar
  - Deciding whether a file belongs on the *.workflow.ts surface at all
tags: [effect-ts, workflow, tagged-union, typeid, family-brand, match-exhaustive, kernel]
---

# Workflow Success Channel Must Be a Branded Tagged Union

## Context

The error channel of a workflow was policed from the start: `Inhabited` resolves an
uninhabited or untagged error channel to a marker whose property name is the remediation
(`workflow-error-channel-gates.md`). The success channel was not — a workflow could succeed
with a bare `number`, a plain interface record, or a single class. Each is a state machine
hidden in a scalar or a field, the shape defect `CONST-D4` names, and none was refused.

The compiled enforcement now closes the gap: `Workflow.make` refuses a decider whose success
channel is not a tagged union of at least two `S.TaggedClass` variants sharing one family
TypeId. The refusal is a compile error at the `make` call, naming the defect in the marker
(`packages/core/effect/cell/types/src/Workflow.ts` — `DecisionShape` composed from
`AtLeastTwoDistinct`, `TaggedMembers`, `SharedTypeId`).

## Guidance

A decision channel must be all three of:

1. **A union of at least two distinct variants** — one variant is a calculation wearing a
   decision's shape; the marker is `SingleVariantDecision`.
2. **Each variant an `S.TaggedClass` with a dispatchable `_tag`** — the marker is
   `UntaggedDecision`.
3. **One family brand shared by every variant** — the repo's `Symbol.for` idiom: a
   module-scope `const XTypeId: unique symbol = Symbol.for('pkg/path/Decision')` plus a
   `readonly [XTypeId] = XTypeId` instance field on each variant class. Divergent or
   missing brands resolve `UnsharedTypeId`. This is the `Decision family brand` entry in
   `CONCEPTS.md` — not Effect's static schema `TypeId`, which every class shares.

The shape check is **presence, not force** (`R7` in the plan and the README): a hand-declared
interface carrying both `_tag` and the brand property still passes the type layer. The brand
is not provenance. What the type layer cannot see, the property tests observe.

### The migration ladder

Every site migrates up the ladder, never skipping a rung:

- **Brand-add** — a site already has two `S.TaggedClass` variants but no shared brand: add
  the family brand only, preserve names and fields (`omp/plugins/omp-claude-compat/src/hooks/admit.workflow.ts`,
  `omp/plugins/omp-claude-compat/src/settings/settings.workflow.ts`).
- **Re-author** — a plain record or interface is the decision: promote its real outcome
  dimensions into `S.TaggedClass` variants, each carrying only its valid fields per
  `CONST-D4` (`omp/plugins/omp-claude-compat/src/hooks/hooks.workflow.ts` — `Block | Allow | Warning`;
  `packages/testing/mutation/stryker-js/typescript-checker/src/Checker.workflow.ts` —
  `CheckFinished | RetestRequired`).
- **Split** — a single aggregate success variant whose consumer branches on a field is a
  hidden state machine: split by the consumer's actual branching
  (`packages/testing/mutation/stryker-js/engine/src/DryRun.workflow.ts` — `DryRunPassed | DryRunFailed`
  from a `{ testCount, failedTestCount }` record; `Instrument.workflow.ts` —
  `InPlaceInstrument | EphemeralInstrument`, which also killed a
  `backupDirectoryHint: ''` sentinel).
- **Declassify** — a workflow with genuinely one outcome is not a decision. The file leaves
  the `*.workflow.ts` surface for a plain `*.kernel.ts` function with the same logic and
  signature (`Config.kernel.ts`, `Project.kernel.ts`, `Run.kernel.ts`,
  `JsonReport.kernel.ts`, `IncrementalDiff.kernel.ts`, `IncrementalReport.kernel.ts`,
  `Reporter.kernel.ts`, `Sandbox.kernel.ts` in the engine and the sibling packages' kernels).
  Never invent a producer-less variant to satisfy the count.

Error channels keep their own rules (`S.TaggedError`, inhabited). A refusal the consumer
renders is a **decision** — promote it to the success union; a genuinely undecidable input
stays an error. `packages/core/effect/cell/types/tests/__fixtures__/InterpreterDecide.workflow.ts`
is the model: an over-short id is `Rejected` (success), a negative length `Malformed` (error).

### Why This Matters

A partially migrated tree does not compile, so no site is left behind by design. The second
variant must be derived from the site's real outcome space and keep at least one producer —
an invented variant compiles and corrupts the union's meaning, which is why review checks
every second variant against its decider body (Gate C).

Two toolchain facts shape the enforcement surface:

- `make-body-purity` forbids a decision body from referencing imported values, so decision
  classes are declared in the owning `*.workflow.ts` (imports from a sibling `*.schema.ts`
  are the sealed exception). Fixture workflows declare their own branded variants inline.
- The shared-TypeId **negatives** are not assertable under tstyche: the assertion compiler
  (TS 6.0.3) leaves a symbol-keyed `keyof` over a class intersection deferred. The refusal
  is real and observed under the package's own `tsc` (TS 7.0.2) — the compile sweep is the
  failing observer. The gap is recorded in `packages/core/effect/cell/types/test-types/Workflow.tst.ts` and recommends a
  runtime brand law per migrated site as the executable complement.

## When to Apply

- Every `*.workflow.ts` file: `Workflow.make` demands the shape, so compliance is
  construction-time, not review-time.
- When a "workflow" can produce exactly one outcome, declassify it to a kernel instead of
  stretching a union.
- When a consumer branches on a field of an aggregate decision, split the aggregate into
  variants named by the branch.

## Examples

Before — a single class with a status field:

```ts
export class CheckerDecision extends S.TaggedClass<CheckerDecision>()('CheckerDecision', {
  results: S.Array(MutantResult),
  needsRetest: S.Boolean,
}) {}
```

After — split by the consumer's real branch, still with one producer per variant:

```ts
const CheckMutantsTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-typescript-checker/CheckMutants')

export class CheckFinished extends S.TaggedClass<CheckFinished>()('CheckFinished', {
  results: S.Array(MutantResult),
}) {
  readonly [CheckMutantsTypeId] = CheckMutantsTypeId
}
export class RetestRequired extends S.TaggedClass<RetestRequired>()('RetestRequired', {
  results: S.Array(MutantResult),
  needsRetest: S.Boolean,
}) {
  readonly [CheckMutantsTypeId] = CheckMutantsTypeId
}
```

The consumer dispatches `Match.tag('Finished', …)` / `Match.tag('RetestRequired', …)` +
`Match.exhaustive`; the second variant is produced by the `needsRetest` branch of the
decider, never invented.

## Related

- `docs/solutions/architecture-patterns/workflow-error-channel-gates.md` — the error-channel
  twin of this document; the two gates travel as a pair.
- `docs/solutions/architecture-patterns/constructor-rule-boundary.md` — the markers only bite
  at the `Workflow.make` call site, so `make` (not the annotation form) is load-bearing.
- `CONCEPTS.md` — the `Decision family brand` entry defines the brand idiom and its naming
  trap.
- `docs/plans/2026-09-03-1617-fix-workflow-success-channel-tagged-union-plan.md` — the full
  requirement set (R1-R10) and the site-by-site rationale (KTD4).
