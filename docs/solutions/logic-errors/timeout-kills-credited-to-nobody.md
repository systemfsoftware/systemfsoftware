---
title: Timeout kills are credited to nobody, so the contribution gate accuses innocent property tests
date: 2026-08-05
category: logic-errors
module: stryker-js-core
problem_type: logic_error
component: testing_framework
severity: high
symptoms:
  - "the contribution gate accuses a property test that demonstrably covers live mutants"
  - "the accusation survives --disableBail, so it is not the first-killer bail artifact"
  - "the run reports 'every killing test was recorded' while some kills name no test"
  - "mutation score counts a kill the report attributes to no test file"
root_cause: logic_error
resolution_type: code_fix
related_components:
  - tooling
tags:
  - mutation-testing
  - stryker
  - timeout
  - test-contribution
  - attribution
  - property-testing
---

# Timeout kills are credited to nobody, so the contribution gate accuses innocent property tests

## Problem

The test-contribution gate in our Stryker fork tells a package that deleting a test file "would leave every mutant just as dead." For `@systemfsoftware/effect-daemon-spec` it said that about two property tests while a `Timeout` kill in the code they cover was credited to no test file at all. The gate cannot support that claim when a kill has no owner — the accused file may be the very thing causing it.

## Symptoms

```
ERROR MutationTestReportHelper Deleting these 2 test file(s) would leave every
mutant just as dead (every killing test was recorded):
  - src/internal/__tests__/restart-decision.schema.property.test.ts
  - src/internal/__tests__/restart-decision.workflow.property.test.ts
```

The parenthetical is the tell: the run claims full attribution while the report contains kills that name nobody.

## What Didn't Work

**Widening the mutate glob.** `effect-daemon-spec` mutated only `src/**/*.schema.ts`, so `restart-decision.workflow.ts` — the package's one pure decision cell, and the primary sanctioned surface — was never mutated. Its property test had nothing it _could_ kill. Widening the glob was correct on its own merits and is a separate landed change, but both files stayed accused afterward.

**Blaming bail.** Under bail Stryker stops a mutant at its first killer, so a file that kills 11 mutants but is never _first_ records zero. That is real (`test-contribution.ts:19-26`) and was the obvious suspect. It was refuted directly: re-running with `--disableBail`, whose message changes to `every killing test was recorded`, produced the identical two-file accusation. Wrong mechanism.

**Adding a roundtrip property** to the sibling `hex-schema` failure. Generated `ruleOfSchemas` pairs already own roundtrip for every exported schema; a hand-written one duplicates generated coverage and is barred by the `no-schema-law-duplicate` lint rule. See [Generated schema laws are tautological](../design-patterns/generated-schema-laws-are-tautological.md) — hand-authored schema property tests earn their place by stating a **refusal**, never by restating a law. This attempt was reverted.

## Solution

Measuring the report instead of theorizing about it located the defect immediately:

```
statuses: {"Ignored":56,"CompileError":14,"Survived":4,"Timeout":2,"Killed":3}

Timeout   killedBy=[]                 coveredBy=11  restart-decision.schema.ts
Timeout   killedBy=[]                 coveredBy=11  restart-decision.schema.ts
Killed    killedBy=["9","10","26",…]  coveredBy=34  restart-decision.workflow.ts
```

`Timeout` is a killing status (`test-contribution.ts:31`), but a timed-out run produces no per-test result, so the mutant arrives with an **empty** `killedBy`. The old accumulator skipped only the absent case:

```ts
const killedBy = mutant.killedBy
if (killedBy === undefined) continue // ← [] falls through
const killers = killersOf(killedBy, fileById)
const soleKill = killers.size === 1 // ∅ ⇒ false; the loop below credits nobody
```

So the kill counted toward the score and toward no file. Two of the five killing mutants in the package were invisible to attribution, and the gate then asserted it had recorded every killer.

The fix records who _covered_ an unowned kill and refuses to judge them:

```ts
const killers = killersOf(mutant.killedBy ?? [], fileById)
// A kill nobody is credited with is still a kill. Whoever covered it may be the one
// causing it, so they cannot be told that deleting them changes nothing.
if (killers.size === 0) {
  const covered = mutant.coveredBy
  // `killersOf` places every id, falling back to the id itself, so an id that names no
  // test file lands in the set inert — no real file is ever spared on its account.
  if (covered !== undefined) { for (const fileName of killersOf(covered, fileById)) unattributed.add(fileName) }
  continue
}
```

`TestFileContribution` gains `coversUnattributedKill`, and the toothless predicate honors it:

```ts
// Covering a kill credited to nobody makes this file unmeasurable, not toothless: the
// accusation is that deleting it changes nothing, and that cannot be shown here.
if (!defends && inScope && !coversUnattributedKill) toothless.push(fileName)
```

## Why This Works

The gate's claim is counterfactual — _deleting this file changes no mutant's fate_. Supporting it requires knowing who kills what. An unattributed kill is a hole in exactly that knowledge, positioned exactly where the claim is made: the accused file covers the mutant, so it is a live candidate for being its killer.

The distinction the fix draws is **unmeasurable vs toothless**, and the codebase already had the precedent one level up — a run crediting _no_ kill to _any_ file was already reported as an unmeasurable run rather than a package of toothless tests (`test-contribution.ts:120-130`). That guard only fired at total attribution failure. Partial attribution failure took the silent path and produced a false accusation. This extends the existing principle to the partial case rather than inventing a new one.

Crucially it is not an escape hatch. Measured across both failing packages:

| Package              | Timeouts | Unattributed kills | Verdict before          | Verdict after             |
| -------------------- | -------- | ------------------ | ----------------------- | ------------------------- |
| `effect-daemon-spec` | 2        | 2                  | exit 1, 2 files accused | **exit 0**                |
| `hex-schema`         | 0        | 0                  | exit 1, 1 file accused  | exit 1, same file accused |

`hex-schema`'s statuses are `{"CompileError":15,"Killed":24,"Ignored":104}` — no timeouts, so `coversUnattributedKill` is `false` for every file and the change is a provable no-op there. Its remaining accusation of `uint8array-from-prefixed-hex.schema.property.test.ts` is genuine and survives untouched, which is the property that distinguishes a fix from a whitewash.

## Prevention

**Make the gate's own tests prove the discrimination, not just the exoneration.** The pair that landed:

```ts
it('spares a file covering a kill credited to nobody, because deleting it may resurrect that kill', …)
it('still accuses a file that covers no unattributed kill when a sibling does', …)
```

The second is the load-bearing one — without it, `return []` passes the first.

**Verify a test defends the contract by deleting the guard, not by reading the test.** Removing `&& !coversUnattributedKill` from the predicate turns the new test red; that measurement is the evidence the test is real, and it takes seconds.

**Measure the report before theorizing about the mechanism.** Two plausible mechanisms (mutate-glob scope, bail undercounting) were wrong. One `node -e` over the run's generated report — `packages/<pkg>/reports/`, gitignored, written by every mutation run — printing `status / killedBy / coveredBy` per mutant named the real one on the first look. When a mutation gate misbehaves, dump the report first.

**Treat a countable assertion in a gate message as a claim to audit.** "every killing test was recorded" was false in a way nothing checked. A message asserting completeness should be derived from the same data that establishes it.

**A defensive guard the gate cannot kill is dead code, so delete it rather than test it.** `packages/stryker-js/core` mutates exactly this one file at `break: 100`, and the first draft of the fix scored **97.62%** with three survivors — all on the new lines. One was real (nothing covered an _absent_ `killedBy`, only an empty one) and earned the test above. The other two were equivalent by construction: a `coveredBy ?? []` fallback and a `fileName !== undefined` guard, both unobservable because an unresolvable id changes no outcome either way. Routing the coverers through the existing `killersOf` helper — which already falls back to the raw id and so never yields `undefined` — deleted both branches and the file returned to 100%. Reaching for a fourth test instead would have been writing tests for code that does nothing.

## Still Open

- `AGENTS.md` (Locked) documents the zero-attribution case — "a run that credits no kill to any test file is reported as an unmeasurable run" — but not the partial case this fixes. It needs one sentence naming unattributed kills. Proposed, not applied.
- `effect-daemon-spec` scores 55.56% against `break: 0`, a tracked debt exception (issue #47, expires 2026-11-03). Passing the contribution gate does not discharge that.
- `hex-schema`'s `uint8array-from-prefixed-hex.schema.property.test.ts` remains genuinely accused: it covers one `MethodExpression` mutant in `prefixed-hex.schema.ts:9` and kills it never; the generated laws do. The prior learning's "2 `S.pattern` mutants still open" note is the same file's unfinished business.

## Related

- [Generated schema laws are tautological](../design-patterns/generated-schema-laws-are-tautological.md) — why hand-written schema property tests state refusals and never restate generated laws; the rule violated by the reverted roundtrip attempt above.
- [Workflow error-channel gates](../architecture-patterns/workflow-error-channel-gates.md) — the sibling shape: a test the mutator cannot fail.
