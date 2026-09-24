---
title: Fork @effect/vitest as @systemfsoftware/vitest to Enforce a Lawful Test Runner
date: "2026-09-24"
module: systemfsoftware
problem_type: tooling_decision
component: packages/vitest
severity: critical
applies_when:
  - Choosing runner primitives and assertion semantics across workspace packages and testing libraries
  - Property-test authoring where agents or contributors satisfy vacuous property verdicts
  - Selecting dependency resolution strategies for first-party forks of external runner packages
  - Managing test runner export ergonomics under strict linting rules
root_cause: permissive_runner_defaults_and_vacuous_property_verdicts
resolution_type: package_fork
related_components:
  - packages/vitest
  - packages/vitest-conformance
  - packages/effect-spec-runtime
  - packages/effect-gherkin-spec
  - packages/differential-spec
  - packages/trace-spec
  - packages/effect-schema-law
  - packages/oxlint-plugin/oxlint-plugin-test-discipline
tags:
  - effect-vitest
  - vitest
  - property-testing
  - runner
  - fork
  - test-runner
  - test-discipline
---

# Fork @effect/vitest as @systemfsoftware/vitest to Enforce a Lawful Test Runner

## Context

Upstream `@effect/vitest` (vendored at `4.0.0-rc.117`) permits structurally vacuous tests and silent state pollution:

1. `it.prop` and `it.effect.prop` pass any returned verdict strictly not equal to `false` (`verdict !== false`). A property returning an un-executed `Effect` object, `undefined`, or a truthy non-boolean passes unconditionally without exercising assertions.
2. Layer lifetimes default to shared execution context across sibling tests without isolation or state leakage checks.
3. Assertions are hard-failing by default, masking multiple independent state invariant violations within a single pipeline stage, or they swallow diagnostic diffs via boolean collapse (`expect(Equal.equals(a, b)).toBe(true)`).
4. Automated agents and cheap language models default to minimal, naive suites (0 of 17 green wave-3 suites authoring shop tests in prototype question 2 wrote an isolation test; authors in prototype question 2 utilized `expect.soft` and `expect.poll` in 0 of 16 suites).

To guarantee test lawfulness without depending on optional author discipline, the runner must make lawful behavior the default and reject invalid patterns at both compile time and runtime.

---

## Architectural Decisions & Alternatives

### 1. Delivery Substrate: First-Party Fork vs. Wrapper/Plugin vs. Lint-Only

- **Alternative A: Wrapper library and helper plugins over upstream `@effect/vitest`.** Rejected. Workflow property suites and direct `it.effect` calls bypass wrapper layers such as `effect-spec-runtime`. Furthermore, critical execution guarantees—idle-driven virtual time scheduling, single-step soft assertion interruption, and automatic fresh layer re-runs—require wrapping the `Scheduler` and test execution runtime directly at test creation (`makeRunTest`), which is private to the runner core and unreachable via external wrappers or standard Vitest setup files. An opt-in wrapper API also does not change what gets written: authors used `expect.soft` and `expect.poll` in 0 of 16 suites (prototype question 2), so only forced defaults move behaviour.
- **Alternative B: Pure static analysis (oxlint rules only).** Rejected. Lint sees source, never an execution: state leakage across test boundaries, idle-driven virtual clock advances, step-boundary fiber interruptions, and property refutation against dynamic impostors are all runtime facts. It also cannot close the dominant lazy-author failure — omission. In prototype question 2, 0 of 17 green wave-3 suites wrote an isolation test; only a check the library runs itself closes that, because there is no test to judge.
- **Alternative C: Owned first-party fork at `packages/vitest` (`@systemfsoftware/vitest`).** Chosen. Forking upstream rc.117 preserves the complete public API surface while embedding enforcement mechanisms directly into test compilation and dispatch.

### 2. Slop Refusal: Drop-in Import Routing vs. Refusal DSL with Fix Messages

- **Alternative A: Drop-in import routing (Prototype Q3).** Rejected. In prototype question 3, `outOfTheBox()` transparently intercepted imports from `vitest` and `effect/TestClock`, re-routing naive idioms (`Effect.runPromise`, `expect(Equal.equals(a, b)).toBe(true)`) to custom implementations. While this brought 58 of 58 naive tests to green without source modifications, it retained corrupted, unidiomatic patterns in the codebase.
- **Alternative B: Lawful DSL with dual compile-time and runtime refusals (Prototype Q4).** Chosen. The runner re-types familiar primitives (`describe`, `it`, `it.effect`, `it.scoped`, `it.layer`, `expect`) to reject malformed patterns (`toBeDefined`, `toBeTruthy`, `toBeFalsy`, `not.toBeNull`, `beforeEach`, `async` test bodies, unhandled boolean assertions) using a unified error message that prescribes the exact syntactic rewrite.
  - _Measured Impact (Prototype Q4):_ Tested with cheap models (`gemini-3.8-flash`, n=5 per arm). Real upstream rc.117 achieved only 1 of 5 green suites after 3 repair cycles, leaving 45 `expect(Equal.equals...)` anti-patterns intact and missing shared-store mutation bugs (catching 5 of 6 bugs). The lawful DSL achieved 5 of 5 green suites on the first repair cycle, eliminated 100% of boolean-collapsed assertions, and caught 30 of 30 seeded bugs (including `LeakedState` detection on `shared-store` across all 5 suites).

### 3. Resolution Protocol: Repository-Wide Alias vs. Dev-Only Alias vs. Specifier Rename

- **Alternative A: Rename import specifiers across the monorepo to `@systemfsoftware/vitest`.** Rejected. Imposes unnecessary churn across 58 importing files and breaks compatibility with external documentation and conventions.
- **Alternative B: Dev-only alias, preserving upstream `@effect/vitest` for published edges.** Rejected. Publishing downstream libraries (`effect-gherkin-spec`, `effect-spec-runtime`, `differential-spec`, `trace-spec`, `effect-schema-law`) with an upstream `@effect/vitest` peer allows third-party consumers to run on an unlawful runner where `owned()` and `recordAssertion()` are absent.
- **Alternative C: Repository-wide pnpm alias on all edges including published peer edges.** Chosen (user-directed). Every package declares `"@effect/vitest": "workspace:@systemfsoftware/vitest@*"`. Source code continues importing `@effect/vitest`. On package publication, pnpm transforms the workspace dependency into `npm:@systemfsoftware/vitest@<version>`.

### 4. Pipeable Signature Compliance: Dual with Proxy `it` vs. Preset Exemption vs. Package Override

- **Alternative A: Preset rule exemption.** Rejected. Disabling `effecttsgo/missing-pipeable-signature` globally weakens repository-wide lint enforcement.
- **Alternative B: Package-level oxlint override.** Rejected. Special-casing `packages/vitest` compromises the consistency of the `libraryRules` configuration.
- **Alternative C: Genuine data-last overload via `Function.dual` backed by a callable `Proxy(it)`.** Chosen (user-directed). Top-level exports (`it`, `test`, `effect`, `live`, `prop`, `layer`, `flakyTest`, `describeWrapped`) satisfy the pipeable-signature gate by implementing dual arity signatures without changing consumer call sites.

---

## Empirical Verification & Benchmark Evidence

All metrics trace directly to the prototype investigation in `.context/compound-engineering/ce-prototype/2026-09-24-lawful-property-api/decisions.md`:

1. **Cheat-Proof Property Gate (Question 1):**
   - Upstream `@effect/vitest`: 0 of 9 cheats caught (2 of 2 controls passed).
   - Strict verdict check alone (Avenue A): 5 of 9 cheats caught.
   - Refuted law via constant impostor (Avenue B): 9 of 9 cheats caught (2 of 2 controls passed).
   - Architectural law kinds alone (Avenue C): 4 of 8 cheats caught.
   - _Outcome:_ Avenue B selected as core gate, combining strict boolean verdict checks (`=> boolean` / `Effect<boolean>`), mandatory run budgets, and impostor refutation.

2. **Lawful DSL Efficiency (Question 4):**
   - Upstream `@effect/vitest`: 1 of 5 suites green after 3 repair loops; 45 collapsed boolean assertions remained; 5 of 6 bugs caught.
   - Lawful DSL: 5 of 5 suites green after 1 repair loop; 0 collapsed boolean assertions remained; 30 of 30 bugs caught.

3. **Workspace-Wide Parity & Execution Overhead (Question 5):**
   - Executed against 18 package suites comprising 1,939 tests.
   - Resulted in exactly 4 outcome changes across the entire repository—all true positives:
     - 1 vacuous property returning an un-executed `Effect` object (`packages/trace-spec/src/drivers/tempo-trace-store.ts`).
     - 1 state leak on a process-global metric registry histogram (`packages/effect-cell-types/tests/pipeline-execution.integration.test.ts`).
     - 2 invalid presence assertions (`packages/discern` and `packages/npm-package`).
   - Execution duration: Cumulative runtime increased by approximately 1.37× (well below the 1.5× planning budget threshold), driven by the mandatory second-run state leak verification pass.

---

## Core Invariants & System Laws

```text
┌────────────────────────────────────────────────────────┐
│                  Test Execution Loop                   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Run 1: Fresh Layer Build, Virtual Clock, Soft Expect   │
└───────────────────────────┬────────────────────────────┘
                            │
              Step check failed?
              ├──► Yes: Interrupt fibers before next step;
              │         Report all step failures as AfterFailedExpect.
              └──► No:  Proceed to assertion accounting.
                            │
                            ▼
              Any assertions recorded?
              ├──► No:  Fail test (NoAssertion).
              └──► Yes: Is block declared shared: true?
                            ├──► Yes: Pass (skip second run).
                            └──► No:  Proceed to Run 2.
                                          │
                                          ▼
┌────────────────────────────────────────────────────────┐
│ Run 2: Fresh Layer Re-build, Throwing Assertions       │
└───────────────────────────┬────────────────────────────┘
                            │
              Run 2 succeeds?
              ├──► Yes: Pass test.
              └──► No:  Fail test as LeakedState.
```

### Invariant 1: Mandatory Step-Boundary Assertion Interruption

In an Effect test pipeline, assertions evaluated within an individual step record failures softly. However, fibers must interrupt before taking their subsequent step if any assertion failed:
$$\text{FiberState}_{n+1} = \begin{cases} \text{Interrupted}, & \text{if } \text{Failures}(\text{Step}_n) > 0 \\ \text{Step}(\text{FiberState}_n), & \text{otherwise} \end{cases}$$

This prevents downstream fibers from executing side effects or mutating fixtures against invalid prerequisite state.

### Invariant 2: Impostor Property Refutation

For any property $P$ asserting subject $S$ over generated inputs $X$:
$$P(S, X) \land \neg P(I_S, X) \implies \text{Admissible}$$

where $I_S(x) = c = S(x_0)$ is the constant impostor returning the initial output invariant of $x$. A property that holds for both the subject and the constant impostor is vacuous ($\text{VacuousProperty}$), except for explicitly declared exempt kinds (`idempotent`, `deterministic`).

### Invariant 3: Clean State Isolation

Unless explicitly annotated with `{ shared: true }`, every test must execute twice against independent layer constructions:
$$\text{Verdict}(T) = \text{Run}_1(T, \text{Layer}_{\text{fresh}}) \land \text{Run}_2(T, \text{Layer}_{\text{fresh}})$$

A divergence between $\text{Run}_1$ and $\text{Run}_2$ denotes state retained across execution boundaries, failing as `LeakedState`.

---

## Anti-Pattern Code Smells

```typescript
// ❌ ANTI-PATTERN 1: Boolean collapse masking assertion diffs
expect(Equal.equals(actual, expected)).toBe(true)
// ✅ REMEDIATION 1: Direct structural comparison via Effect Equal
expect(actual).toEqual(expected)

// ❌ ANTI-PATTERN 2: Unconstrained, subject-free property test
it.prop('sorts correctly', [fc.array(fc.integer())], (xs) => {
  sort(xs) // Return value ignored; non-boolean passes!
})
// ✅ REMEDIATION 2: Lawful property with subject injection and strict boolean returns
it.prop('sorts correctly', {
  of: [S.Array(S.Int)],
  subject: sort,
  runs: 100,
}, (sortFn, [xs]) => isSorted(sortFn(xs)))

// ❌ ANTI-PATTERN 3: Mutable test state across concurrent tests
describe('Counter', () => {
  let count = 0
  it.effect('increments', () =>
    Effect.sync(() => {
      count++
    }))
})
// ✅ REMEDIATION 3: Test-scoped isolated context via fresh layers or local Refs
it.layer(CounterLive)('increments', (it) => {
  it.effect('increments', () =>
    Effect.gen(function*() {
      const counter = yield* Counter
      yield* counter.increment
    }))
})
```

---

## Verification & Guard Rails

1. **Targeted Conformance Suite:** Validated in `packages/vitest-conformance` executing nested Vitest runs via in-process worker threads.
2. **Cheat Corpus Conformance:** Enforces 9 of 9 cheat detections from Prototype Question 1.
3. **Double Execution Verification:** Confirms state leakage detection on non-shared layers without global process isolation.
4. **Lint Enforcement:** `packages/oxlint-plugins/test-discipline` prohibits importing `expect` directly from `vitest` and forbids boolean predicate collapses.
