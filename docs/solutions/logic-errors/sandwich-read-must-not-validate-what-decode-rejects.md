---
title: "A sandwich read that builds a Schema class validates it there, so decode never sees the bad input"
date: 2026-09-24
category: logic-errors
module: "effect-daemon-spec supervisor step cell"
problem_type: logic_error
component: cell-architecture
symptoms:
  - "a dynamic `stopChild` naming an out-of-range generation never returns"
  - "the `CommandRejected` write handler exists but never runs"
  - "a caller waiting on a reply hangs until its scope is torn down"
root_cause: missing_workflow_step
resolution_type: code_fix
severity: high
tags: [sandwich, command-rejected, schema-class, disable-checks, read-phase, effect-schema, supervisor]
---

# A sandwich read that builds a Schema class validates it there, so decode never sees the bad input

## Problem

The supervisor step cell is a `Sandwich`. Its `read` phase wraps the incoming `SupervisionEvent` and the current state in `new SupervisionStep({ state, event })`, and its `CommandRejected` handler answers the request as stale. A `DynamicStopRequested` whose `generation` falls outside the `Generation` schema (`0..1_024`) never got an answer: `stopChild` waited forever.

## Failure Mechanism

1. The constructor of an Effect v4 `Schema.Class` / `Schema.TaggedClass` runs the schema's checks. It skips them only when given `{ disableChecks: true }`, which the vendored `Schema` parser honours as `options.disableChecks`.
2. `read` builds the class inside `Effect.map`, so an input that fails a check throws in the callback. That throw is a defect in `read`, not a decode failure.
3. `Sandwich` sends only a failed _decode_ to `CommandRejected`. A defect in `read` skips `decode`, `decide` and every `write` handler, so the reply that `CommandRejected` would send is never sent.

The declared rejection path could not be reached. The validation it exists to handle had already run, one phase earlier, on a channel that nothing handles.

## Solution

`read` gathers inputs and does not validate them. Build the command without checks, and leave validation to the sandwich's decode:

```ts
const readStep = (runtime, event) =>
  Effect.map(
    Effect.zip(Clock.currentTimeMillis, Ref.get(stateOf(runtime.acquired.handle))),
    ([now, state]) => new SupervisionStep({ state, event: { ...event, at: now } }, { disableChecks: true }),
  )
```

`CommandRejected` then receives the malformed event and answers the waiting request.

## Why This Works

The sandwich defines a single point where input becomes trusted, and that point is `decode`. Each check has to run where its failure has a handler. A check in `read` has none: its failure turns into a defect that kills the fiber running the cell.

## Architectural Invariant

- **A phase validates only if it can route the failure.** In a `Sandwich`, only `decode` routes a validation failure (to `CommandRejected`). `read` returns raw material, and a Schema class built in `read` passes `{ disableChecks: true }`.
- **Every `CommandRejected` handler has a test that reaches it.** Give the cell an input that its command schema refuses, and assert the observable answer, not only that the handler exists. The lifecycle scenario "A stop naming an incarnation that cannot exist is answered at once" timed out before the fix and passes after it.

## Code Smells

- `new SomeCommand(...)` or `SomeSchema.make(...)` without `disableChecks` inside a `Sandwich.named(...)(read)` callback.
- A `CommandRejected` handler whose cell has no test that feeds it an input the command schema refuses.
- A hang or dead drain fiber where a malformed request was expected to be answered as refused or stale.

## Related

- `docs/solutions/architecture-patterns/workflow-error-channel-gates.md`: error channels of the `decide` workflow
- `CONCEPTS.md`: Cell Architecture, the five-phase sandwich
