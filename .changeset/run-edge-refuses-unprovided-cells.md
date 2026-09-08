---
"@systemfsoftware/effect-cell-types": major
---

`Cell.run` now refuses a cell that still demands services: calling it returns
a marker naming the missing services instead of an effect, so using the
result where an effect is expected is a compile error. Provide the services
with `Cell.provide` at the composition root before running.

BREAKING CHANGE: the curried form `Cell.run(input)` is gone — call
`Cell.run(cell, input)` directly. A cell whose requirements are not fully
provided no longer runs; it fails to compile with the `UnprovidedCell`
marker.
