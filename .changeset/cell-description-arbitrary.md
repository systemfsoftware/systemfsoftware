---
'@systemfsoftware/effect-cell-types': minor
---

Publish the description's vocabulary as part of the package's own surface: `Cell.vocabulary` (the phase names, kinds, conventions and intra-layer order, folded from the canonical description at module load), `Cell.canonical`, `Cell.DESCRIPTION_MODULE`, `Cell.IO_CELLS` and the `Cell.IoCellClassification` type derived from it.

This is what lets a consumer recover every axis by walking a value instead of restating it beside one. The classification type is `typeof IO_CELLS` rather than a hand-written twin, so a reclassified cell cannot drift between the two.

Generators, lint rules and type-level observers built on this walk live in their own packages and depend on this one; nothing in this package depends on them.
