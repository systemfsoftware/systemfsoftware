---
title: Request timeout armed after asynchronous bootstrap creates unbounded wait
date: 2026-08-16
category: test-failures
module: packages/effect-atom
problem_type: logic_error
component: testing_framework
symptoms:
  - "First request against a cold or wedged protocol frame blocked up to five minutes while advertising a 30-second timeout"
  - "Rejections could not distinguish between a frame that failed to load, a frame stuck in presync, or a dropped RPC reply"
root_cause: async_timing
resolution_type: code_fix
severity: high
tags:
  - timeout-budget
  - async-timing
  - postmessage-bridge
  - metrics-integrity
  - mutation-testing
  - test-doubles
---

# Request timeout armed after asynchronous bootstrap creates unbounded wait

## Problem

When an asynchronous client advertises a per-operation timeout but arms its timer only _after_ awaiting an underlying subsystem's readiness, the advertised budget is violated. The total wait becomes the sum of the setup timeout plus the operation timeout, while callers expect a strict bound.

Furthermore, when the timeout eventually fires, the rejection loses context on where the time was spent, and metric histograms that record elapsed time on timeout sample only the residual fraction of the window, distorting service telemetry.

## Mechanism & Failure Modes

### 1. Cumulative Timeout Stacking

If setup carries an initial load allowance and a readiness allowance, placing setup awaits before arming the per-request timer creates a sequential cascade:
$$\text{Max Latency} = T_{\text{load}} + T_{\text{ready}} + T_{\text{request}}$$

Callers programming to a strict deadline hang for multiple combined phases during cold starts or worker stalls.

### 2. Loss of Phase Attribution

A single generic `TimeoutError` without phase metadata makes diagnosis impossible. Telemetry cannot distinguish whether the host frame failed to load, the worker hung during presync, or the remote RPC dropped the reply.

### 3. Metric Inversion on Failure

When a request budget starts at call time but the latency stopwatch begins only when the message is dispatched, measuring duration on timeout records only the leftover fraction of the window, falsely pulling p95/p99 latency metrics downward during outages.

### 4. Teardown Orphan Leaks

If the underlying connection or frame is reset while a request is awaiting a reply, failing to drain the pending registry leaves caller promises hanging until their timers expire.

## Architectural Invariants

### 1. Unified Call-Time Budgeting

A single deadline timer must be armed at the public entry point before any setup or dispatch awaits occur. All subsequent asynchronous phases (`load`, `ready`, `reply`) are raced sequentially against that single deadline:

```ts
const budget = startRequestBudget(method, timeoutMs)
try {
  await budget.guard('load', ensureHostFrame())
  if (needsProtocolReady) {
    await budget.guard('ready', ensureProtocolFrame())
  }
  const sent = sendRequest(frameWindow, method, payload, onProgress)
  try {
    const value = await budget.guard('reply', sent.reply)
    recordRoundtrip()
    return value
  } catch (error) {
    pendingRequests.delete(sent.id)
    throw error
  }
} finally {
  budget.release()
}
```

### 2. Phase-Attributed Rejections

The timeout error must carry the exact phase in flight at the moment the timer fired (`load` | `ready` | `reply`), determined dynamically inside the timer callback.

### 3. Root-Cause Precedence

Explicit domain errors (such as peer crashes or session resets) must take precedence over budget expiration when settling first.

### 4. Immediate Teardown Drain

Any lifecycle transition that invalidates the underlying channel must synchronously drain and reject all in-flight pending requests with an explicit cancellation error.

## Verification & Prevention Rules

- **Enforce Two-Sided Timer Boundaries:** A timeout test must assert not just that a request fails at $T$, but that it remains pending and unresolved at $T - 1\text{ms}$.
- **Probe Cleanup Invariants with Mutation Gates:** Verify that removing `budget.release()` or `pendingRequests.delete(id)` causes a test to fail.
- **Dual-Driver Test Harness:** Encapsulate the boundary into a Consumer Driver that sends requests and a Peer Driver that scripts lifecycle transitions (`open`, `ready`, `respond`, `fatal`).
- **Audit Unbudgeted Setup Awaits:** Disallow unbudgeted setup calls preceding budgeted operations:
  ```ts
  // ❌ Defect: Setup is outside the budget
  await ensureReady()
  await withTimeout(op, 30_000)

  // ✅ Invariant: Budget wraps setup and operation
  await withTimeout(async () => {
    await ensureReady()
    return op()
  }, 30_000)
  ```
