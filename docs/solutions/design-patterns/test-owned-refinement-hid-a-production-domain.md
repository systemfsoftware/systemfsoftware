---
title: A test-owned refinement hid a production domain - PCT step and seed counts
date: 2026-10-12
category: design-patterns
module: effect-sim-kernel
problem_type: design_pattern
component: testing_framework
severity: medium
applies_when:
  - a property test declares its own refined schema for a value production keeps as a bare number
  - deciding whether a bound in a test is a domain invariant or only a cost cap on generated values
  - a public option takes a count, index, length or depth typed as number
related_components:
  - packages/sim/effect-sim-kernel
  - packages/sim/differential-spec
  - packages/effect-spec-runtime
tags:
  - schema-laws
  - refinements
  - brands
  - pct
  - property-testing
  - invariants
---

# A test-owned refinement hid a production domain - PCT step and seed counts

## Context

`Kernel.pick` and `Kernel.pct` took `steps` and `seeds` as bare `number`. Their in-source laws drew both from test-local schemas: `RequestedSeeds` (`Schema.Int`, 1..3) and `Bound` (`Schema.Int`, 1..10,000). Each range had to be classified under the schema-laws pack. Either it is a domain invariant production must own (`invariants-as-refinements.md`), or it is a property-cost cap the harness may keep on generated values. A test-owned copy of a production concept is the gap `tests-own-no-schemas.md` names.

Both ranges read like cost caps. They were also the only place the domain was written down, and production silently degraded outside it.

## Failure mechanism

Out-of-domain counts never failed. They weakened exploration or corrupted the run accounting, and no suite reports either.

1. **Step count, which places change points.** `changePoints` draws each index as `Math.floor(rng() * Math.max(steps, 1))`:
   - `NaN` and `Infinity` yield keys (`NaN`, `Infinity`) that equal no step index, so no change point ever fires.
   - `-1` and `0` put every change point at index 0.
   - A fraction such as `2.5` confines them to the first three decisions.

   Measured in this session against the built package, with a two-fiber race explored at 250 seeds: a step count equal to the baseline's explored decisions gave **178** distinct schedules. `0`, `-1`, `2.5`, `NaN` and `Infinity` each gave **71**, with no error and no warning.
2. **Seed count, which sizes the replay loop and the report.** `pct` reports `seeds + 1` runs and loops while the index is below `seeds`. Same session, same package:

   | `seeds` | runs reported                | runs executed |
   | ------- | ---------------------------- | ------------- |
   | `3`     | 4                            | 4             |
   | `2.5`   | 3.5                          | 4             |
   | `-1`    | 0                            | 1             |
   | `NaN`   | none (no result within 10 s) | -             |

3. **The copied range was wrong at the low end too.** `Bound` started at 1, but production produces a step count of 0: a baseline with no explored decisions. A test schema copied from intuition is wrong at both ends.

## Why This Works

The fix moves the domain into production and keeps the cost cap in generation only:

```ts
const generatedBetween = (minimum: number, maximum: number) =>
  Schema.makeFilter<number>(() => undefined, { arbitraryConstraint: { order: Order.Number, minimum, maximum } })

export const PctStepCount = Schema.Int.pipe(
  Schema.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }, { message: '...' })),
  Schema.check(generatedBetween(0, 10_000)), // never refuses; it only bounds generated values
  Schema.brand('PctStepCount'),
)
```

`PctSeedCount` (whole, ≥ 0, generated 0..3) and `PctDepth` (whole, ≥ 1, generated 1..5) follow the same shape. `pick` and `pct` take the brands, so a bare `number` no longer compiles, and `PctStepCount.make(-1)` refuses at construction. The test schemas are deleted, and the laws draw from the production schemas.

## Invariants and their gates

- **A count, length, index or depth on a public option is a branded production refinement, not `number`.** Gate: `tsc -b` rejects a caller that passes a bare number. The classification itself is a `review` decision. Wrong: a test declares `Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 10_000 })))` for a value production types as `number`. Right: production exports the branded schema, and the test draws from it.
- **A limit that exists only to keep property tests fast never refuses a real value.** It lives in an `arbitraryConstraint` filter on the production schema (`arbitrary-filter-floors.md`). Gate: `review`. Wrong: a `maximum: 10_000` in `isBetween`. Right: `isBetween` up to `MAX_SAFE_INTEGER` plus `generatedBetween(0, 10_000)`.
- **Read the refinement's contract off what a caller observes, not off a decode-verdict property.** On the built package, `Kernel.PctDepth.make`, `Kernel.PctSeedCount.make` and `Kernel.PctStepCount.make` throw for -1, 0.5, `MAX_SAFE_INTEGER + 2`, `NaN` and `Infinity` (and 0 for depth), and a bare number does not type-check where a brand is expected. The in-domain behaviour the refinement protects is held by the behaviour laws that draw from it (`changePoints` over a drawn `PctStepCount` and `PctDepth`; `pct`'s run count over a drawn `PctSeedCount`). PR #744 removed the in-source properties that drew a base number, decoded the refined schema and compared the verdict with an independent whole-number predicate, by owner ruling: they test the schema's decode, not behaviour a kernel caller sees. Those properties did catch a loosened bound, because their predicate was written apart from the schema; after the removal nothing automated does. The behaviour laws only draw in-range values, `pick` and `pct` never decode their options, and the kernel has no mutation lane. This is an accepted exception, not a covered invariant. `refusals-beside-generated-laws.md` still prescribes the removed form, so the pack and the ruling disagree until the pack's owner amends it. Gate: `review`. Wrong: citing the removal as proof the properties were tautological. Right: stating that a widened `isBetween` bound now ships green, and that the owner accepted that.
- **Classify a test-owned range by evidence.**
  - Enumerate every production producer. Here each step count is a `.length`, a maximum of lengths, or a whole-number constant.
  - Probe out-of-domain values against the built artifact.
  - Silent degradation means a production invariant; refusal means the domain is already owned.

  Gate: `review`, decided on the probe output.

## Examples

Branding a value that crosses a package boundary reaches the dependents' source. `DualExecutionSupervisor` in `differential-spec` now builds its step count with `Kernel.PctStepCount.make(order.steps.length)`. That edits its own source, so the untouched-dependent `none` intent stops applying (`changeset-requirement-keys-on-turbo-build-hash.md`). Its API exposes no kernel type, so it ships a `patch` that depends on the new kernel major. Gate: the changeset-management `check` in CI.

## Related

- `invariants-as-refinements.md`, `tests-own-no-schemas.md`, `arbitrary-filter-floors.md` (schema-laws pack); `refusals-beside-generated-laws.md` prescribes the decode-verdict form this learning advises against for these refinements
- PR #744 (pending merge): introduces `Kernel.PctDepth`, `Kernel.PctSeedCount` and `Kernel.PctStepCount`
