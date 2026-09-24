---
title: The Cell computation strictly separates input, outcome, failure, and service channels
applies_when:
  - typing a Cell signature or public operation
  - declaring errors or returns for an outside interaction
  - reviewing channel assignments on Cell<I, A, E, R> or Error classes
tags: [cell, channels, type-contracts, errors, cause]
---

Every published cell is a branded computation `Cell<in I, out A, out E, out R>`. The four channels have strict, invariant responsibilities:

- **Input (`I`)**: The command or parameter type. Must be total.
- **Outcome (`A`)**: The expected business response. Domain refusals (e.g. `OrderRejected`, `InsufficientStock`) are modeled as tagged outcome variants on `A` that were processed by `encode` and persisted by `write`.
- **Infrastructure Refusal (`E`)**: Typed unexpected failures that short-circuit execution (`DecodeError`, `NetworkTimeout`, `DbCrash`). Never use strings or untagged exceptions. Errors wrapping underlying failures declare `cause: Schema.optional(Schema.Unknown)` and pass caught exceptions directly without string message truncation.
- **Service Requirements (`R`)**: Capability tags (`Context.Service`) required by `read` and `write` phases. Must be satisfied before execution.

A cell never returns `Stream<T>` on `A`; streaming belongs to the subscription layer. Eager `Promise<T>` is strictly banned anywhere on the cell's public surface.

```ts
// WRONG: domain refusal in E, unvalidated promise in A, lossy error string
export interface BadCell {
  run: (id: string) => Promise<{ error?: string; data?: Order }>
}

// RIGHT: 4 clean channels, domain outcome on A, infrastructure failure on E with cause
export const orderCell: Cell.Cell<
  SubmitOrderRequest,
  OrderApproved | OrderRejected,
  DatabaseConnectionError | SchemaError,
  OrderStore | CustomerGate
> = Sandwich.named('order.submit')(readContext)
  .decide(decideWorkflow)
  .write({
    OrderApproved: (approved, req) => commitOrder(approved, req),
    OrderRejected: (rejected, req) => logRefusal(rejected, req),
    CommandRejected: (rejected, req) => Effect.fail(new SchemaError({ issue: rejected.issue })),
  })
```

Gate: `type-checker` — validates assignability to `Cell<in I, out A, out E, out R>`.
Review: verify domain decisions live on channel `A`, channel `E` is reserved for infrastructure errors, and errors preserve underlying causes.
