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

1. `Sandwich.named(name)(readFn)`: The `name` is a static literal operation string used for telemetry spans and duration metrics. The `read` phase pulls raw data from stores, queues, sockets, or clock environments.
2. `.decode(Sandwich.pure(decodeFn))`: Pure validation of raw inputs into typed domain commands. Decode failure is an `Effect` failure that short-circuits the pipeline straight to the cell's `E` channel.
3. `.decide(workflow)`: A pure decision `Workflow` created with `Workflow.make`. Decision refusals (`Result.fail(DomainError)`) are domain _outcomes_ that pass to `encode` and `write`; channel assignment is prescribed by `four-channel-contracts.md`.
4. `.encode(Sandwich.pure(encodeFn))`: Pure transformation of the decision outcome into persistence payloads, response DTOs, or notification events.
5. `.write(writeFn)`: Terminal impure phase persisting mutations, emitting events, or returning responses.

When input decoding or output encoding is identity, use the raw three-phase sandwich chain: `read` → `decide` → `write`.

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
  .decode(Sandwich.pure(decodeOrder))
  .decide(decideOrderWorkflow)
  .encode(Sandwich.pure((outcome) => Result.succeed(formatOutcome(outcome))))
  .write((encoded, raw) => persistOrderEffect(encoded, raw))
```

Gate: `type-checker` — `Sandwich` continuation interfaces carry sentence types (`sentence: must decide after decode`, `sentence: must write after encode`) that restrict the lawful next step.
