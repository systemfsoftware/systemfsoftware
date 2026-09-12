---
"@systemfsoftware/effect-cell-types": major
---

The exported `Cell.run` helper is removed. Run a cell through its own arrow instead: `cell.run(input)` replaces `Cell.run(cell, input)`, in both the data-first and the curried form. The helper only forwarded to that arrow, so a migrated call site behaves identically.
