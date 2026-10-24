---
title: Cells that feed one another compose into one cell through Cell combinators, never through chained .run calls
applies_when:
  - one cell's outcome feeds another cell
  - assembling a multi-step interaction in a service, a blueprint or a handler
tags: [cell, composition, combinators]
---

When one cell's outcome feeds another cell, the two compose with Cell.andThen (or Cell.gate when the first yields an Option); never yield* first.run(...) and pass its result to second.run(...) inside an Effect.gen, a cell phase or a handler.

Two cells over the same input compose with Cell.zip, and one cell over a sequence of inputs with Cell.collect or Cell.collectAll; never one .run per cell or per item.

```typescript
// WRONG
export const handleOrder = (cmd: PlaceOrder) =>
  Effect.gen(function*() {
    const validated = yield* validateCell.run(cmd)
    return yield* chargeCell.run(validated)
  })
```

```typescript
// RIGHT
export const placeOrderCell = validateCell.pipe(Cell.andThen(chargeCell))
```

Gate: judge
