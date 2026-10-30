---
title: Cells that feed one another compose into one cell with Cell combinators, never through chained .run calls
applies_when:
  - one cell's answer feeds another cell
  - running two cells over the same input, or one cell over a list of inputs
  - assembling a multi-step interaction in a service, a blueprint, a workflow or a handler
tags: [cell, composition, combinators]
---

Always compose with `Cell.andThen` when one cell's answer feeds another (`Cell.gate` when the first answers an Option), `Cell.zip` or `Cell.zipWith` for two cells over the same input, and `Cell.collect` or `Cell.collectAll` for one cell over a list. Run the composed cell once, at the run edge: the composition root, or the one `.run` call in the route or request handler that serves the request.

Never call `.run` on one cell and pass its answer to another cell's `.run`, run two cells on the same input, or run one cell once per list item. Chained `.run` calls are an Effect function, not a cell: the interaction cannot be handed to `Cell.provideContext` once or composed further, and a second decision hides inside the outer cell's I/O.

```typescript
// WRONG
const validated = yield* validateCell.run(command)
return yield* chargeCell.run(validated)
// RIGHT
export const placeOrderCell = validateCell.pipe(Cell.andThen(chargeCell))
```
