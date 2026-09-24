---
"@systemfsoftware/differential-spec": minor
---

Differential and Metamorphic checks now accept asynchronous targets: reference, candidate, and system effects may use Effect.sleep, Effect.promise, or any other deferred Effect, and both sides are awaited through fast-check's async property with the same shrinking, minimal-counterexample report, failure fingerprint, and runBudget/interruptAfterTimeLimit behaviour.
