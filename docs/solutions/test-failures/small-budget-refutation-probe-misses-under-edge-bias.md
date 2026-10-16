---
title: A refutation probe with a small run budget missed its counterexample under the integer generator's edge bias
date: 2026-10-13
category: test-failures
module: vitest-conformance
problem_type: test_failure
component: testing_framework
symptoms:
  - "property-budget.integration.test.ts fails intermittently in the shrink-cap scenario: expected { …(3) } to match object { …(3) }"
  - "cappedShrinks and uncappedShrinks are both empty strings, so no PropertyRefuted message was reported"
  - "A run with the probe's seed fixed by CONFORMANCE_REPLAY at salt 429 fails every time on the unmodified fixture"
root_cause: logic_error
resolution_type: test_fix
severity: medium
tags:
  - property-testing
  - arbitrary
  - edge-bias
  - flaky-test
  - vitest-conformance
  - probe-fixture
---

# A refutation probe with a small run budget missed its counterexample under the integer generator's edge bias

## Problem

A conformance probe had to be refuted within its seven configured draws, but drew from a domain where only some values refute it. Effect's integer generator puts about a third of its early draws below 10, so about one seven-draw check in 2,000 drew no counterexample, the property passed, and the scenario that expects a refutation failed.

## Symptoms

- The scenario "A property with its own budget runs that many times and keeps the configured shrink cap" in the `vitest-conformance` property-budget feature fails with `cappedShrinks: ""` and `uncappedShrinks: ""`, where it expects `0 shrink(s)` and `Shrunk input: [10]`.
- Rerunning usually passes. The scenario provides no seed, so each run's probe draws a fresh one.

## What Didn't Work

- **Looking for a runner or kernel defect.** The runner honours the configured `runs` and `maxShrinks`, and draws a fresh seed when none is provided: the property engine's `program` takes `Random.nextInt`, and `resolveSeed` falls back to it. That is the documented contract. The simulation kernel is not involved: the feature is `.live` over `Layer.empty`.
- **Reading the failure rate as evidence of a second cause.** The flake was reported at about 1 in 160 runs. Two independent samples of 20,000 seeds left the probe unrefuted 9 and 13 times, about 1 check in 1,800. A shrink cap cannot change whether a check refutes, and the scenario runs two checks, so about 1 file run in 900 fails. 529 consecutive local runs of the unmodified file passed, which is unlikely (about 4%) at 1 in 160 and likely (about 55%) at 1 in 900. The first failing salt, 429, is this mechanism's first failure in a salt scan from 0, so salt 429 is this cause. The test-job logs of every failed CI run from 2026-10-01 to 2026-10-13 hold two occurrences of the scenario, and both match this mechanism: the capped check refuted, and the uncapped check reported nothing under the probe's identity hash `1174434983`. How many CI runs executed the scenario was not measured, so the 1 in 160 figure is neither confirmed nor refuted.
- **Raising the run budget, pinning a seed, or retrying.** Each hides the precondition instead of meeting it. More runs only lower the miss rate, and the scenario's subject is the configured budget of seven. A pinned seed explores one schedule. A retry turns a real precondition failure into noise.
- **A lower bound alone.** `Schema.Int.check(Schema.isGreaterThanOrEqualTo(10))` takes its first draw from only 10 and 11, so the first draw is already the shrink target in 58% of runs and the cap goes unobserved.

## Solution

The probe draws only counterexamples, so seven draws refute it under any seed:

```ts
// before: refuted only by n >= 10, drawn from 0..1000
{ of: [Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 }))], subject: keepSmall }

// after
const SMALLEST_COUNTEREXAMPLE = 10
{
  of: [Schema.Int.check(Schema.isBetween({ minimum: SMALLEST_COUNTEREXAMPLE, maximum: Number.MAX_SAFE_INTEGER }))],
  subject: keepSmall,
}
```

The scenario and its assertions are unchanged.

## Why This Works

Effect 4's `Arbitrary` ports fast-check v4.9.0's numeric edge bias. The vendored source in `repos/effect/packages/effect/src/internal/arbitrary/` matches the installed `effect@4.0.1`, and its comments link the fast-check files it ports (`IRawProperty.ts`, `BiasNumericRange.ts`, `IntegerArbitrary.ts`):

- The bias factor is `2 + floor(log10(attempt + 1))` (`generateAttemptRaw` in `runner.ts`), so during the first nine attempts half the draws come from an edge range.
- `numberBiasRanges` and `selectBiased` in `model.ts` pick the edge closest to zero two times in three. For `0..1000` that edge is `[0, 9]`, values that do not refute the probe. About 34% of early draws miss, and seven draws all miss with probability about 0.338⁷.

With every value in the domain a counterexample, the first draw refutes the property. The uncapped run still shrinks to `[10]`, the domain minimum. When the first draw is already 10, the capped and uncapped runs look the same and the cap goes unobserved. The edge-range width grows with log₂ of the domain, so the wide upper bound keeps this to about 0.6% of capped runs, measured over 20,000 seeds (3.6% for `10..1000`). Under this generator, a shrink target outside the low edge range would need that whole range to pass, which puts the miss rate back at (1/3)⁷ or more. Removing the miss rate therefore costs some rare cap-unobservable runs, and those runs still pass.

Reproduction without changing source: `CONFORMANCE_REPLAY='property=1174434983;seed=2167684532;runs=7'` replays the probe under salt 429's seed. It fails the scenario on the old fixture and passes on the new one, and the same holds for the next failing salts, 1241, 4913 and 5276.

## Prevention

- **A probe whose scenario requires a refutation within a small budget draws only counterexamples.** Gate: `review`. Wrong: a domain where only part of the values refute, sized for a uniform draw. Right: a domain where every value refutes, wide enough that the first draw is rarely the shrink target.
- **Measure a probe's miss rate on the engine before trusting a budget.** Run `Arbitrary.checkEffect` over a few thousand seeds with the scenario's `runs` and count non-`Falsified` results. Gate: `review`. The miss rate comes from the generator's bias schedule, not from intuition about the domain's size.
- **Reproduce a seed-dependent probe failure through `CONFORMANCE_REPLAY`.** The plain entry `property=<identity hash>;seed=<seed>;runs=<runs>` replays a nested probe's draws without editing source.

## Related

- `docs/solutions/performance-issues/ci-gate-silent-then-timed-out-after-kernel-exploration.md`: the opposite failure, where too large a budget caused CI timeouts
- `docs/solutions/logic-errors/agent-outranks-ci-run-depth.md`: a property's verdict depends on the draw count it actually receives
- `docs/solutions/tooling-decisions/fork-effect-vitest-as-lawful-runner.md`: the fork's run budgets and refutation reporting
- `compound-packs/schema-laws/arbitrary-filter-floors.md`: constraining a generator constructively; this learning constrains it to the refuting region
