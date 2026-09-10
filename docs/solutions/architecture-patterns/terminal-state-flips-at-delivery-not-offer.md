---
title: A stream's terminal state flips at consumer delivery, never at producer offer
date: "2026-09-10"
category: architecture-patterns
module: stryker-js-engine
problem_type: logic_error
component: messaging
severity: high
symptoms:
  - "A reporter that rejects on an early event while its bounded queue is still draining is classified as a terminal-phase failure and bumps the exit code, instead of being detached with the exit code untouched"
  - "Two reviewers independently anchored the same race from offer-site and consumer-site evidence"
root_cause: async_timing
resolution_type: code_fix
related_components:
  - stryker-js-engine
  - stryker-js
tags:
  - reporter-protocol
  - pull-stream
  - backpressure
  - state-machine
---

# A stream's terminal state flips at consumer delivery, never at producer offer

## Context

The reporter pull-stream host (issue #372) keeps a per-reporter state cell (`'streaming' | 'terminal' | 'detached'`) that decides how a consumer rejection is classified: rejected while `'terminal'` means the run fails; rejected earlier means log-and-detach with the exit code untouched. The first implementation flipped the cell to `'terminal'` inside the emitter fiber, the moment the terminal event was _offered_ into the bounded queue.

With a full queue (256) and a slow consumer, the emitter can block on the terminal offer with the cell already flipped. A consumer rejecting on an _earlier_ event then sees the guard `state !== 'terminal'` be a no-op, and `settleAttachment` maps the rejection to a terminal-phase failure — bumping the exit code for what the contract calls a detach. The multi-reviewer round caught it twice independently (correctness traced the interleaving; the adversarial pass derived the same site from a CAS-timing angle).

## Guidance

State that means "the consumer has observed X" must be set where the observation happens — at the consumer's pull site — not where the producer enqueues X. In this host the delivery-observing iterator wraps `next()` and flips the cell only when the pulled value _is_ the terminal event:

```ts
next: ;
;(async () => observe(await iterator.next()))
// observe: if (!result.done && isTerminalReportEvent(result.value)) set 'terminal'
```

The producer side then carries no state transition at all, and the `'terminal'` guard in the detach path becomes exactly the contract's classification rule: rejection after the consumer received the terminal event fails the run; rejection before it detaches.

The same round fixed the mirror-image leak with one line: a consumer that _fulfils_ early (stops pulling) must also detach, or its unbounded inbox accumulates every remaining event for the rest of the run — `consumer.then(onFulfil → detach, onReject → detach)`, where the `'terminal'` guard keeps normal completion a no-op.

Prevention tip: when a state cell classifies outcomes, enumerate the producer events and the consumer observations separately and ask which side each transition means. "Terminal" here meant _consumer saw the last event_ — so the offer site was the wrong owner by definition, and no amount of locking at the offer site would have fixed it.

## Applies when

Any producer/consumer boundary with a bounded queue and a distinguished last message: work queues, graceful-drain protocols, iterator/cancellable streams. The bug class is invisible to tests that keep the queue empty, so the regression scenario must fill the bounded queue before the consumer rejects.
