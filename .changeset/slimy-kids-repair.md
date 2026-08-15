---
"@systemfsoftware/effect-cell-types": major
---

The Cell description becomes an ordered sequence of phase records (name, kind, convention, run) under a description root carrying the package module name and the I/O-cell classification, so consumers fold the value to recover the whole vocabulary instead of re-declaring it.

**Migration.** A description built with the public constructors needs no change — `Cell.read(...) -> Cell.decode(...) -> ... -> Cell.write(...)` and `Cell.apply` behave exactly as before. Two things break:

- `Layer<P>` was a record of optional name-keyed slots (`layer.read`, `layer.decode`, …) and is now `{ phases: ReadonlyArray<Phase<P>> }`. Code reading a slot by name reads `layer.phases.find((phase) => phase.name === 'read')` instead, or folds the array.
- A hand-built layer object, legal under the old optional-slot type, no longer type-checks. Build it with the constructors; they are what write the stage brands the interpreter reads.

`Cell.apply`'s runtime contract narrowed with the shape: it executes the phases in the order the value declares and requires a write phase closing each layer, where before it ran a fixed five-phase sequence and died on an unfilled slot. Constructor-built descriptions cannot tell the difference — the chain only type-checks in canonical order.
