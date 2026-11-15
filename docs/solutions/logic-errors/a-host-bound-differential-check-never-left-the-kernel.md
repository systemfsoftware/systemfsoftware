---
title: A host-bound differential check never left the simulation kernel, so it failed on its first host wait
date: 2026-11-15
category: logic-errors
module: differential-spec
problem_type: logic_error
component: testing_framework
symptoms:
  - "a Differential.compare that declares hostBound fails with DisparityFailure, Output A and Output B \"(not executed)\""
  - "the report's trace names `_tag: \"Blocked\", on: \"Socket\"` for a target that makes an HTTP request"
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [differential-spec, effect-sim-kernel, host-bound, fetch, undici, fast-check]
---

# A host-bound differential check never left the simulation kernel, so it failed on its first host wait

## Problem

The README told a target that reaches a real file, socket or timer to declare `hostBound`. But `hostBound` only became the test's wall-clock timeout (`checkOptions`). Every case still ran under `Kernel.run` with the default `external: 'fail'`, so the first host wait ended the run.

## Symptoms

- `DisparityFailure` with both outputs "(not executed)" and `Blocked { on: 'Socket' }` in the trace.
- No existing test had a host-bound target, so nothing exercised the option.

## What Didn't Work

- Running host-bound cases under `Kernel.run(program, { external: 'await' })`. That gets past the socket wait, but `fetch` still fails as `Escape`. Node's undici calls `setTimeout` (`FastTimer.refresh`) and `setImmediate` (`Parser.onMessageComplete`) on its own, and the kernel's escape recorder fails any real timer (R2).
- Letting a timer through when its caller frame is `node:internal/`. Rejected under review. It misses undici installed from npm (frames under `node_modules`) and fetch on Bun or Deno, and it weakens R2 for every kernel user to serve one harness. `'await'` refuses `choose`, so it explores no schedules anyway.

## Solution

With `hostBound` set, `checked` runs `liveChecked`. fast-check generates and shrinks inputs as before, and each case's dual program runs once with `Effect.runPromise`. The report gives both sides' exits and names the host-bound reason where a schedule would be. Checks without `hostBound` are unchanged. The kernel is unchanged.

## Why This Works

A host-bound target's waits are real I/O that the kernel cannot schedule or replay. So there is no schedule to explore, and the kernel can add nothing to the comparison. Effect's own runtime runs real I/O as written. The input still gets the property search and shrinking, which is the part of a differential check that a host-bound target can use.

## Prevention

- `tests/host-bound.differential.test.ts` compares a reference that doubles a number over real HTTP (via `fetch`, to a local `node:http` server) with an in-memory candidate. It checks that an agreeing pair holds, and that a disagreement shrinks to input 0 with both answers and the host-bound reason in the report.
- An option that changes what a check may touch needs a test that touches it.

## Related Issues

- None.
