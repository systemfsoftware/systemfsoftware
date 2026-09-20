---
title: Every outside interaction follows the I/O sandwich (read -> transform -> write) with no interleaved I/O
applies_when:
  - authoring or changing a module that performs I/O or interacts with external resources
  - designing an interaction flow that reads external state and persists changes
  - reviewing an executor, handler, or service that sequences operations
  - deciding where to place network, database, filesystem, or clock reads
tags: [cell-architecture, sandwich, fcis, io, executor, boundary]
---

# Every outside interaction follows the I/O sandwich (read -> transform -> write)

Every external interaction must be shaped as an I/O sandwich:

1. **Read (Impure)**: Pull raw inputs — databases, storage, network gateways, clocks, environment.
2. **Transform (Pure Filling)**: Decode raw bytes into branded domain types, execute pure domain decisions (`Workflow.make`), and shape output events or representations.
3. **Write (Impure)**: Persist state changes, emit messages, and respond to callers.

```text
read → decode → decide → shape → write
impure bread (read, write) around a thick pure filling (decode, decide, shape)
```

## Doctrine & Constraints

- **No interleaved I/O**: Never perform `read → decide → read → decide`. Doing I/O mid-decision turns the filling impure and destroys testability without mocks (`CONSTITUTION.md` CONST-B3).
- **Dependent reads**: When a later read depends on an earlier decision, use one of three sanctioned remedies:
  1. _Pre-fetch_: Read all potentially needed state up-front before entering the pure filling.
  2. _Split_: Break the operation into two distinct sequential sandwiches, where the write of the first triggers or precedes the second.
  3. _Open in the shell_: Keep the coordination explicitly in the imperative shell rather than wrapping a fake "pure core" around interleaved effects.
- **Pass-through layers banned**: Do not insert boilerplate forwarding layers that neither read, transform, nor write. The shell calls the core directly.
- **Type-carried ordering**: The phase order must be enforced by types (e.g. `Sandwich.read(...).decide(...).write(...)`), where each phase's return type carries the member required by the next step (`CONSTITUTION.md` CONST-B6). Hand-sequencing where any permutation compiles reduces the sandwich to an unenforced comment.

## Calibration Examples

- **wrong**:
  ```ts
  // Interleaved read/decide in shell
  const user = await db.getUser(id)
  if (user.isActive) {
    const orders = await db.getOrders(user.id) // second read after decision!
    await emailService.sendSummary(orders)
  }
  ```
- **right**:
  ```ts
  // Pre-fetch or compose pure decisions
  const data = await db.getUserAndOrders(id) // Read
  const decision = decideSummaryAction(data) // Pure transform
  if (decision._tag === 'SendSummary') {
    await emailService.sendSummary(decision.orders) // Write
  }
  ```

## Verification & Gate

- `review`: The reviewer confirms that impure effects (database, network, clock, filesystem) sit exclusively at the start (`read`) or end (`write`) of the interaction flow, and that the pure filling contains no effect invocations or promises.
- `type-checker`: When using `@systemfsoftware/effect-cell-types` `Sandwich`, the compiler rejects inverted or out-of-order phase composition.
