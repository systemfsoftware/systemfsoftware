---
"@systemfsoftware/effect-cell-types": minor
---

Two combinators join the Cell surface.

`Cell.gate` runs one Cell only when another's response carries a value. A response carrying a value
admits it to the inner Cell, and the composed response wraps the inner Cell's response; a response
carrying nothing skips the inner Cell entirely — its phases never run — and the composed response
carries nothing either. A failure from the outer Cell is the composed failure, never a silent skip,
and both Cells' error and service channels union.

`Cell.collect` runs one Cell per item, in iteration order, then folds the responses with a plain
function. The fold sees every response and runs only when every item succeeded; the first refusal
from an item fails the composed Cell with that item's own refusal. `Cell.collectAll` is the
accumulate opt-in: an item's refusal is data handed to the fold rather than a failure, so the fold
always runs over every per-item result. An empty collection hands the fold an empty list and runs no
item.

Both are callable in the curried and data-first styles of `map`, `andThen`, and `zip`, and neither
requires a workflow brand at its call site.
