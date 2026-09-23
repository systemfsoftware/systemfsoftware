---
title: "Differential supervisor targets run on the live clock, outside the test's TestClock"
date: 2026-09-23
category: developer-experience
module: differential-spec
problem_type: developer_experience
component: testing_framework
applies_when:
  - "Writing or reviewing a differential or metamorphic test whose targets defer through Effect.sleep, Effect.promise, or any other asynchronous Effect"
  - "Choosing how long a target under the dual-execution supervisor may pause before the suite gets slow or times out"
symptoms:
  - "A scenario registered with it.effect takes real wall-clock time even though the runner supplies a TestClock, because target sleeps advanced in real time"
  - "A supervisor source change that bridges a Promise with an async function is rejected by the effecttsgo(async-function) lint rule"
root_cause: async_timing
resolution_type: code_fix
severity: low
related_components:
  - effect-gherkin-spec
  - fast-check
tags:
  - differential-spec
  - test-clock
  - live-clock
  - async-targets
  - fast-check
---

# Differential supervisor targets run on the live clock, outside the test's TestClock

## Context

`@systemfsoftware/differential-spec` runs both sides of a comparison through `dualHolds`, which evaluates the target pair with `Effect.runPromise(runDual(...))` inside a fast-check `fc.asyncProperty`, awaited via `Effect.promise`. Tests register through `it.effect` from `@effect/vitest`, which runs the _scenario_ effect under the test environment — including its `TestClock`. The targets are not part of that fiber: `Effect.runPromise` starts them on the default runtime's services, so nothing the scenario fiber carries (the TestClock included) is inherited.

## Failure Mechanics

1. **Detached-runtime evaluation.** `dualHolds` hands the pair to `Effect.runPromise`, which executes on the default runtime's services. Neither the TestClock nor any scenario layer propagates into that execution.
2. **The boundary went silent at the async cutover.** Under the former `Effect.runSync` evaluation a deferred target died loudly inside the supervisor. After the `fc.asyncProperty` cutover deferred targets are simply accepted, so the boundary no longer announces itself; only wall-clock suite time reveals it.
3. **Budget multiplication.** The check executes the pair `runBudget` times (default 100, set by `DEFAULT_OPTIONS` in the supervisor), plus shrinking re-runs after a failure. A target sleeping $t$ milliseconds therefore costs at least $2 \cdot \text{runBudget} \cdot t$ of wall time per check.

## Architectural Invariant

**A detached runtime inherits nothing from the spawning fiber.** Any effect handed across a runtime boundary (`Effect.runPromise`, `Effect.runSync`, a worker's own runtime) executes on the boundary's services, never the caller's ambient ones:

- Wrong: assuming `it.effect`'s TestClock advances a target's `Effect.sleep` because the scenario itself runs under `it.effect`.
- Right: treating supervisor targets as live-clock code — tiny deferrals, no waits on the test clock.

## Verification & Prevention

- Evidence anchor: the scenario `Targets that pause on a sleep before settling are compared like any other` in `packages/differential-spec/tests/supervisor.integration.test.ts` passes with real 1 ms sleeps; under the scenario's TestClock those fibers would never resume and the test would time out instead.
- Keep deferrals inside targets to single-digit milliseconds; budget arithmetic above scales any larger sleep linearly.
- The repo lint rejects `async` functions in `src` (`effecttsgo(async-function)`); Promise bridges in supervisor code are `.then` chains, not `async`/`await`.

## Applicability

Holds for any consumer driving the supervisor inside a TestClock-scoped runner (today `@effect/vitest`'s `it.effect`). If a future change threads the ambient runtime into the supervisor — a runtime-parameterised dual execution — the boundary closes and this guidance can retire.
