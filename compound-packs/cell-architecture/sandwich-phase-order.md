---
title: Every outside interaction must follow the typed five-phase Sandwich chain
applies_when:
  - authoring an outside interaction, use case, API endpoint, or event subscriber
  - chaining read, decode, decide, encode, and write phases
  - executing external I/O around business rules or workflow execution
tags: [cell, sandwich, phases, fcis, io-boundary]
---

Every outside interaction is an **I/O Sandwich**: five sequential phases executed in order:
`read` (impure) → `decode` (pure) → `decide` (pure) → `encode` (pure) → `write` (impure).

The interaction is authored using `Sandwich.named(name)`:

1. `Sandwich.named(name)(readFn)`: The `name` is a static literal operation string used for telemetry spans and duration metrics. The `read` phase pulls raw data from stores, queues, sockets, or clock environments, returning the command schema's `Encoded` type.
2. `decode`: Derived automatically by the library using the workflow's `command` schema via `Schema.decodeUnknownResult`. Malformed input produces a `CommandRejected` error dispatched to the write handlers.
3. `.decide(workflow)`: A pure decision `Workflow` created with `Workflow.make({ command, decision, error, decide })`. Decision outcomes and domain refusals pass to encoding; channel assignment is prescribed by `four-channel-contracts.md`.
4. `encode`: Derived automatically by the library using the workflow's `decision` and `error` schemas via `Schema.encodeResult`.
5. `.write(handlers)`: Terminal impure phase dispatching to an exhaustive handler record keyed by encoded decision tags, error tags, and `CommandRejected`. Handlers receive the encoded value and the original encoded command.

Every sandwich chain is five phases: `read` → `decide` → `write` where decode and encode are derived from schemas.

```ts
// WRONG: hand-sequenced imperative steps with no phase order guarantees
export const processOrder = async (req: Request) => {
  const raw = await fetchOrder(req.id)
  const cmd = decodeOrder(raw)
  const decision = decideOrder(cmd)
  await persistOrder(decision)
}

// RIGHT: typed Sandwich chain; out-of-order phase composition fails compilation
export const processOrderCell = Sandwich.named('order.submit')((req: Request) => fetchOrderEffect(req.id))
  .decide(decideOrderWorkflow)
  .write({
    OrderAccepted: (accepted, raw) => persistOrderEffect(accepted, raw),
    OrderRejected: (rejected, raw) => logRefusalEffect(rejected, raw),
    CommandRejected: (rejected, raw) => Effect.fail(new InvalidOrderInput({ issue: rejected.issue })),
  })
```

Gate: `type-checker` — `Sandwich` continuation interfaces enforce the lawful chain `named -> decide -> write` and hold write handler keys exhaustive over decision tags, error tags, and `CommandRejected`.
