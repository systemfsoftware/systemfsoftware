---
title: "A settle-window poll must judge quiet only on a read, and cut each read off at the deadline"
date: 2026-09-23
category: logic-errors
module: "trace-spec RemoteObservation.layer"
problem_type: logic_error
component: testing_framework
severity: high
applies_when:
  - "writing a poll that waits until an external store stops changing (settle window, quiet period, debounce over reads)"
  - "a poll loop evaluates its verdict before each re-read as well as after it"
  - "a poll has a total timeout but its individual reads have none"
tags: [polling, settle-window, deadline, effect-timeoutoption, testclock, flaky-test, trace-spec]
---

# A settle-window poll must judge quiet only on a read, and cut each read off at the deadline

## Problem

`RemoteObservation.layer` reads a trace store every `interval` and answers once the union of spans has gained nothing for `settle`, bounded by `timeout`. Two defects passed the unit's own tests. A store that added a span on every read was judged finished after one read, which failed the live-clock contract scenario about 1 run in 6 under parallel load. A store that accepted a read and never answered held `collect` past `timeout` indefinitely.

## Failure Mechanisms

1. **Quiet judged without evidence.** The loop evaluated the full verdict (settled, absent, unfinished) both after each read and before each re-read. With $t_a$ the time of the last addition and $t_c$ the pre-read check, the check answered _settled_ whenever $t_c - t_a \ge \text{settle}$. Under the live clock $t_c - t_a = \text{interval} + \text{scheduling delay}$, so any delay of at least $\text{settle} - \text{interval}$ settled a growing trace. Any configuration with $\text{interval} \ge \text{settle}$ settled after the first read every time.
2. **Deadline enforced only between iterations.** `timeout` was compared against the clock at loop boundaries, so one read's latency was unbounded: $T_{\text{collect}} = t_{\text{last check}} + T_{\text{read}}$ with $T_{\text{read}} \to \infty$ for a stalled store.

## Architectural Invariants

- **Quiet is evidence, and only a read produces evidence.** A settled verdict may come only from a read that added nothing, at least `settle` after the last addition. The union is unchanged between reads because nobody looked, not because the store is finished.
- **A total budget bounds every step inside it.** Each read gets the time left, not a fresh allowance, and hitting the budget answers from the evidence gathered so far.

```text
poll():
  if elapsed >= timeout: answer(nothing seen ? absent : unfinished)   // deadline only, never "settled"
  read = timeoutOption(source(traceId), timeout - elapsed)
  if read timed out:     answer(nothing seen ? absent : unfinished)
  union' = union ∪ read (first record per span id wins)
  if union' quiet for settle:  answer(settled)                          // only here
  if elapsed >= timeout:       answer(absent | unfinished)
  sleep(interval); poll()
```

In the code, the pre-read check is `deadlineVerdict` and the post-read check is `settleStep` (via `verdictOf`). The bounded read is `readOnce` over `Effect.timeoutOption`, which interrupts the in-flight read when time runs out.

## Verification

- A deterministic TestClock scenario with $\text{interval} > \text{settle}$ over a store that grows on every read must report _unfinished_. It fails on the pre-read-settle loop every time, so the flake became reproducible.
- A store that answers once and then never answers must report _unfinished_ after exactly two reads, instead of hanging.
- A property law settles two independent reads in turn and asserts the union keeps every span id from both. A mutation of the union to only the fresh spans fails it. A single-read version of the law did not catch that mutation.

## Code Smells

- A poll loop that calls the same verdict function before and after its read.
- `Effect.sleep(interval)` inside a deadline loop whose source call has no `timeout*` combinator.
- A timing flake "fixed" by widening `settle` or `timeout` in the test instead of reproducing it under TestClock.
