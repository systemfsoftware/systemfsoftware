---
"@systemfsoftware/effect-atom": minor
---

Exported functions that took their subject first, such as `Atom.map`, `Atom.transform`, `Atom.withFallback`, `Result.map` and `Hydration.dehydrate`, can now also be called data-last inside `pipe`. Existing calls keep working.
