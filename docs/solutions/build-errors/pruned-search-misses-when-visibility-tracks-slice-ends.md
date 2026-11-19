---
title: Preemption-bounded search misses counterexamples when step visibility relies on how a slice ends
category: build-errors
module: effect-sim-kernel schedule search
date: 2026-11-19
problem_type: logic_error
component: test_tooling
severity: high
symptoms:
  - "a pruned preemption-bounded search reports no failure where the unpruned search, or a pct run, finds one"
  - "a linearizability check accepts a history it used to reject after an Effect minor upgrade, with no source change"
  - "the failing step between two observed primitives is a lone Ref read that schedules nothing and touches no other fiber's task"
root_cause: contract_drift
resolution_type: design_change
framework_version: effect 4.1.4, @systemfsoftware/effect-sim-kernel
retire_when: "StepRecord.visible's contract changes, or pruning no longer derives from per-step visibility"
tags:
  - effect-sim-kernel
  - schedule-search
  - pruning
  - visibility
  - silent-gate
---

# Preemption-Bounded Search Misses Counterexamples When Step Visibility Relies On How A Slice Ends

## Problem and context

`StepRecord.visible`'s contract says a step is visible when it "touched state
another fiber can observe — a `Ref` or `Deferred` field, another fiber's task,
or more than one scheduled task". The implementation checked only
`task.external || extraScheduling || touchesFiber(ran)`: whether the slice
ended in an external queue hop, the step scheduled more than one task, or
another fiber reached into the running fiber's task. A step whose only shared
access was a lone `Ref`/`Deferred` field read or write recorded nothing in any
of those slots and was treated as invisible.

Under Effect 4.1.2 that gap was masked: every slice ended by re-queueing the
fiber's resume as an external task, so nearly every step was `external` and
therefore visible. Effect 4.1.4 resumes budget yields inline (`_autoYielded`),
the external hop disappeared, and the same steps — a check-then-set's `Ref.get`
between two auto-yield boundaries — became invisible. Pruning skips deviations
at invisible steps, so the one-pause schedules that expose the race were pruned
away: pruned search found nothing while unpruned search and pct still did, and
linearizability checks began accepting non-linearizable histories.

## Diagnosis

1. Run the same target pruned and unpruned at the same bound; unpruned finds
   the failure, pruned does not.
2. Print the zero-preemption step trace: the decisive steps are `forced`
   continuations with no `external`/`vis` marker, sitting between two observed
   primitives.
3. Compare against the `visible` contract: the step accessed a `Ref` field (the
   kernel's `observeShared` recorded it in `touches`) but `touchesFiber(ran)`
   only asks whether the ran _fiber_ was touched, never whether any shared
   state was.

## Fix

`isVisible` now honors the contract: a step that put anything in `touches`
(any `Ref`/`Deferred` field access, or another fiber's task) is visible, in
addition to the external and multi-scheduling cases. The fix is in
`packages/sim/effect-sim-kernel/src/internal/kernel.ts` (`isVisible`).

Alongside it, Effect 4.1.4's yield boundaries are first-class: the kernel
intercepts `Fiber.yieldNow` and records a `BoundaryRecord`
`{step, kind, activeFiber, runnableFibers, chosenFiber, preempted}` for every
boundary, inline continuations included; `RunOptions.expectTrace` fails a
replay closed with `ReplayTraceDiverged` on a boundary-kind or runnable-set
mismatch; and a deviation at a step whose previous active fiber blocked spends
no preemption (`StepRecord.activeBlocked`). Choosing the active fiber's own
continuation at a boundary costs 0; switching away from a still-runnable one
costs 1 — which the existing step-choice model already expressed once the
boundaries were observable.

## Why not fixed differently

Raising search or pct budgets would have hidden the miss, not fixed it: the
counterexample was reachable at the original bound the moment the visibility
contract was honored. Re-recording oracles was unnecessary — no serialized
trace was involved; the failing scenarios all explore schedules live.
