---
title: A workflow property declares a coverage class for each input region its claim is about, and the run proves it reached each one
applies_when:
  - writing or changing a property in a *.workflow.property.test.ts
  - a property's predicate holds trivially on some inputs (a guard that returns true, an early return, a ternary to true)
  - a property's claim depends on a boundary or a collision that a uniform draw rarely produces, or its draws pass a precondition that discards some
tags: [property-test, coverage, cover, reach, vacuous-pass]
---

Every property in a *.workflow.property.test.ts declares `cover` with one class for each input region that selects a tag its claim is about, defined by the command fields the contract names (an offset, a mode, a phase), and one for each side of each boundary it names.

A cover predicate reads only the drawn inputs (CoveragePredicate in the runner's engine.ts), so a class never classifies by decision tag; an input predicate that recomputes decide is a replica (oracles-are-independent-of-the-code-under-test.md). The runner cannot classify outputs today.

A region reached on every draw by construction declares no class; a one-line comment names the construction instead.

A class's predicate classifies the drawn input from the contract (offset === 0, mode === 'read-only'), never a constant (() => true), and names a precondition the run must produce on correct code, never the violation itself.

A class's minimum is at least 0.05 (this pack's floor); a rarer region gets a generator that builds it, named in a comment (boundaries-and-collisions-are-constructed.md).

Any branch of the predicate that returns true without checking the subject's output has a class for the condition that leads past it; prefer a generator that never produces that case.

A precondition that discards draws (fc.pre, .filter, a refinement on a drawn schema) has a class for the region it keeps: "using implication carelessly can severely skew test case distribution: consider using cover" (QuickCheck docs, ==>). A run that discards too many fails as PropertyExhausted.

The runner fails a declared class the run does not reach with CoverageBelowMinimum, and only where property suites run: merge_group and local runs (each-suite-runs-in-its-lane.md). An unreached class means the region is unreachable or the tests are too weak to reach it (Antithesis, sometimes assertions); line coverage, a run count or a pass count is never evidence that a region was reached.

Whether each region the claim is about has a class, or a named construction, is decided by the review judge; an uncertain case escalates.

```typescript
// WRONG: most draws take the guard, and nothing shows how often the refusal branch ran
it.prop(
  '∀c_AdmitCharge_→Exhausted',
  { of: [AdmitCharge], subject: admitCharge },
  (subject, [command]) =>
    command.limit < command.spent + command.requested
      ? Result.getOrThrow(subject(command))._tag === 'BudgetExhausted'
      : true,
)
```

```typescript
// RIGHT: the limit is built from a drawn slack, so both sides and the equal point are produced, and the run proves it
// ChargeCount's generation bound keeps spent + requested + 2 a safe integer
it.prop(
  '∀c_AdmitCharge_→ExhaustedPastLimit',
  {
    of: [ChargeCount, ChargeCount, Schema.Literals([-2, -1, 0, 1, 2])],
    subject: admitCharge,
    cover: {
      pastLimit: [(_s, _r, slack) => slack === -1, 0.1],
      atLimit: [(_s, _r, slack) => slack === 0, 0.1],
      underLimit: [(_s, _r, slack) => slack === 1, 0.1],
    },
  },
  (subject, [spent, requested, slack]) =>
    Result.getOrThrow(subject(
      new AdmitCharge({ spent: spent + 2, requested, limit: spent + 2 + requested + slack }),
    ))._tag === (slack < 0 ? 'BudgetExhausted' : 'ChargeAdmitted'),
)
```

Gate: judge
