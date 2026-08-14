---
"@systemfsoftware/oxlint-plugin-effect-executor": major
---

Name the call site that skips a description, and retarget the I/O rule onto phase bodies.

`executor-requires-description` is new and recommended at error: a file that calls a workflow's decision while declaring no `Cell` description is reported, so an unmigrated call site is caught by a check rather than by review. The predicate keys on the call, resolved back to the workflow import edge per EE1, never on the import alone — two files in this repo import a workflow value and correctly declare no description, and keying on the import would report both.

`executor-no-io-in-filling` changes subject. It walked a workflow call's argument list; it now walks the pure phase bodies of a description — `decode`, `decide`, `encode` — and reports a store, adapter or clock call reached through a closure-captured value, which is the I/O a pure phase's `Either` return type cannot see. Read and write bodies are impure by design and are never walked.

What that rule no longer catches: a suspended effect, since `YieldExpression` and `AwaitExpression` detection is removed. The coverage moved rather than vanished. Inside the new subject a suspension is unrepresentable — a generator body types as `Generator` and an async body as `Promise`, and both are rejected against `DecidePhase` with `TS2345` — and outside it, a hand-sequenced workflow call is now reported by `executor-requires-description`.

Its message also stops over-claiming. It asserted "every input already read and decoded before the decision", an order across statements, while the check reads one call's arguments; per EE5 no rule here claims to enforce statement order.
