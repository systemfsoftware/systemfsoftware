---
"@systemfsoftware/effect-cell-types": minor
---

Adds the `Blueprint` and `Handle` cell kinds. A blueprint is a cold, immutable description of an external target that never acquires anything. `Blueprint.make<Spec>()(TypeId).steps({ steps, targets })` gives each step a method and a same-name `dual`, and exposes targets such as `scoped` and `layer` as properties. `.operations<Ops>()({ operations, targets })` declares each operation once as a type-level transition, so its method and both `dual` forms agree even when the result type depends on the arguments. An operation or target that also extends `Blueprint.Conditional` is absent wherever its type is `never` for the blueprint's type index; every other member stays present, including in code that is generic over the index. `Handle.make<Data, Slot>()(TypeId)` mints a pipeable handle record with its own brand, a guard, and a private slot only its module can read.
