---
title: Cells compose algebraically via combinators, never through sequential cell.run calls
applies_when:
  - composing two or more cells into a workflow
  - piping operations where an earlier cell's output feeds a later cell
  - assembling multi-step pipelines in services or route handlers
tags: [cell, composition, combinators, and-then]
---

Cells are first-class, lazy, pipeable values. When an interaction requires multiple distinct steps (e.g. a subsequent read that depends on an earlier decision), cells must compose algebraically using `@systemfsoftware/effect-cell-types` combinators rather than imperative sequential calls:

- **`Cell.andThen`**: Feeds the outcome `A` of the first cell as the input `I` of the second cell. Service channels (`R`) and error channels (`E`) union automatically.
- **`Cell.zip`**: Runs two cells against the same input and tuples their responses `[A, B]`. Fails fast: if the first cell errors, the second never executes.
- **`Cell.gate`**: Conditionally executes an inner cell only when the preceding cell outputs `Option.some(value)`.
- **`Cell.collect` / `Cell.collectAll`**: Runs a cell over an iterable of inputs, folding responses into a single value.

Do not call `yield* cell.run(input)` sequentially inside an `Effect.gen` block. Running cells sequentially destroys pipeline laziness, defeats static inspection of the full interaction graph, and creates multiple uncontrolled execution edges.

```ts
// WRONG: sequential cell.run invocations inside an Effect.gen block
export const handleOrder = (cmd: OrderCmd) =>
  Effect.gen(function*() {
    const validated = yield* validateCell.run(cmd)
    const charged = yield* chargeCell.run(validated)
    return yield* fulfillCell.run(charged)
  })

// RIGHT: algebraic pipeline via Cell.andThen; single runnable cell output
export const handleOrderCell = validateCell.pipe(
  Cell.andThen(chargeCell),
  Cell.andThen(fulfillCell),
)
```

Gate: `type-checker` — verifies output-to-input type alignment across `andThen` chains.
Lint: `oxlint` rule `no-sequential-cell-run` flags multiple `yield* cell.run(...)` calls in a single generator.
