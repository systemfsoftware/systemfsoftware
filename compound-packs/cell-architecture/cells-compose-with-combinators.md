---
title: Cells that feed one another compose into one cell with Cell combinators, never through chained .run calls
applies_when:
  - one cell's answer feeds another cell
  - running two cells over the same input, or one cell over a list of inputs
  - assembling a multi-step interaction in a service, a blueprint, a workflow or a handler
tags: [cell, composition, combinators]
---

When one cell's answer feeds another, the two compose with `Cell.andThen` (`Cell.gate` when the first answers an Option). Two cells over the same input compose with `Cell.zip` or `Cell.zipWith`, and one cell over a list with `Cell.collect` or `Cell.collectAll`. The composed cell is run once, at the run edge: the composition root, or the one `.run` call in a route or request handler that serves the request.

**Decision test.** In a service, blueprint, workflow, handler or cell phase the diff touches, the rule fails when the code calls `.run` on one cell and passes its answer to another cell's `.run`, calls `.run` on two cells with the same input, or calls `.run` on one cell once per item of a list.

**Defect it prevents.** Chained `.run` calls are an Effect function, not a cell. The interaction has no Cell value to hand to `Cell.provideContext` once at the root or to compose further (`orElse`, `match`, `collect`). Written inside another cell's read or write phase, it hides a second decision inside that cell's I/O, where the outer cell's decide step never sees it.

```typescript
// WRONG
export const handleOrder = (command: PlaceOrder) =>
  Effect.gen(function*() {
    const validated = yield* validateCell.run(command)
    return yield* chargeCell.run(validated)
  })
export const reserveAll = (orders: ReadonlyArray<Order>) => Effect.forEach(orders, (order) => reserveCell.run(order))
```

```typescript
// RIGHT
export const placeOrderCell = validateCell.pipe(Cell.andThen(chargeCell))
export const reserveAllCell = reserveCell.pipe(Cell.collect((answers) => answers))
```

**Source.** @systemfsoftware/effect-cell-types README, "Composing cells", and src/Cell.ts: `andThen` "feeds this Cell's response to the next Cell as its input", `collect` "runs the Cell once per item, in order" (https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/effect-cell-types).

Gate: judge
