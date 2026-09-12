---
"@systemfsoftware/effect-cell-types": minor
---

`Cell.gate` runs one Cell only when another's response carries a value: the value admits it to the inner Cell and the composed response wraps the inner response, carrying nothing skips the inner Cell entirely, and both Cells' error and service channels union.

`Cell.collect` runs one Cell per item, in order, then folds the responses with a plain function. The first refusal fails the composed Cell with that item's own refusal. `Cell.collectAll` is the accumulate opt-in: an item's refusal travels to the fold as data, so the fold always runs over every result.

Both combinators are callable in the curried and data-first styles, and neither requires a workflow brand at its call site.
