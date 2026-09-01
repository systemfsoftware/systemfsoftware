---
"@systemfsoftware/effect-cell-types": major
---

Cell is one sandwich: build it with `Cell.layer` and run it with `Cell.run`.

`Cell.apply` and the chained phase constructors (`Cell.read`, `Cell.decode`, `Cell.decide`, `Cell.encode`, `Cell.write`) are removed. `Cell.layer` takes one spec object — `{ read, decide, write }` rules on what the read produced, or add `decode` and `encode` together to adapt both sides of the decision.

Phase bodies that `yield*` a service publish it on the Cell's requirements channel; provide once with `Cell.provide` or `Effect.provide`. A missing provide is a compile error at the run site.

New arrows: `map`, `mapInput`, `andThen`, `zip`, `provide`, `withPolicy`. A refused decision reaches your write as the outcome value — only read, decode, and write failures fail the effect. The vocabulary drops `applier`.
