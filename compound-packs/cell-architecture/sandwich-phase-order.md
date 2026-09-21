---
title: Every outside interaction must follow the five-phase Sandwich chain
applies_when:
  - authoring an outside interaction, use case, or API endpoint
  - chaining read, decode, decide, encode, and write phases
  - reviewing an operation built with Sandwich or Cell
tags: [cell, sandwich, phases, fcis]
---

An outside interaction is an **I/O Sandwich**: five sequential phases executed in order:
`read` (impure) -> `decode` (pure) -> `decide` (pure) -> `encode` (pure) -> `write` (impure).

The phases must be constructed through `Sandwich.read(...)` and its fluent continuation methods. The builder interfaces carry type-level sentences (`sentence: must decide after decode`, `sentence: must write after encode`) that expose only the lawful next step. Composing phases out of order or omitting intermediate transitions is a compile error.

Do not hand-sequence phases as bare procedural function calls (`write(decide(read(raw)))`). When functions are hand-composed, any permutation type-checks and the compiler can guarantee nothing. When a step is missing, use the raw chain (`read` -> `decide` -> `write`), where the workflow operates directly on the raw input and passes its outcome directly to the writer.

A decode failure is an `Effect` failure: it short-circuits the pipeline before `decide` is called and routes directly to the cell's `E` channel. A decision refusal (`Result.fail(DomainError)`) is an _outcome_, not an execution abort: it travels through `encode` into `write` so the writer can persist domain events or audit logs before responding.

```ts
// WRONG: hand-sequenced calls without Sandwich phase guarantees
export const processOrder = async (req: Request) => {
  const raw = await fetchOrder(req.id)
  const cmd = decodeOrder(raw)
  const decision = decideOrder(cmd)
  await persistOrder(decision)
}

// RIGHT: typed Sandwich chain; out-of-order calls fail compilation
export const processOrderCell = Sandwich.read((req: Request) => fetchOrderEffect(req.id))
  .decode(Sandwich.pure(decodeOrder))
  .decide(decideOrderWorkflow)
  .encode(Sandwich.pure((outcome) => Result.succeed(formatOutcome(outcome))))
  .write((encoded, raw) => persistOrderEffect(encoded, raw))
```

Gate: `type-checker` — `Sandwich` continuation interfaces restrict available methods per phase.
Review: ensure all external boundary operations construct a `Sandwich` instead of raw asynchronous imperative procedures.
