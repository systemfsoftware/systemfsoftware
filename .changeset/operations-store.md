---
"@systemfsoftware/agent-front-door": minor
---

Add `@systemfsoftware/agent-front-door/operations`, the durable operation store behind the contract kernel's `Operations` service.

`operationStoreOf({ ctx, sinks })` records an operation that settles exactly once: a repeat of the same answer is idempotent and a different answer is refused as `AlreadySettled`. `layer({ namespace })` provides `Operations` over a Durable Object namespace, `watch` streams each state and closes at settlement, and `armOperation` schedules the alarm that expires an unconfirmed hold. Every registered `SettlementSink` is notified after the settlement commits, and a failing sink never reverts it.
