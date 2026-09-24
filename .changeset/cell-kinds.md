---
"@systemfsoftware/effect-cell-types": minor
---

Adds the `Resource` and `Handle` cell kinds. `Handle.make<Data, Slot>()(TypeId)` mints a pipeable handle record with its own brand, a guard, and a private slot only its module can read. `Resource.make<Spec>()({ typeId, combinators, projections })` builds an immutable resource whose every combinator is both a method and a same-name `dual`, and whose projections such as `scoped` and `layer` are properties. A variant sharing the brand keeps its variant when a shared `dual` configures it.
