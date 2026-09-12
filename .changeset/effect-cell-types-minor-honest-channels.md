---
'@systemfsoftware/effect-cell-types': minor
---

`collectAll` now declares an error channel of `never`: the composed cell cannot fail, because every per-item refusal is delivered to the fold as a `Result`. Composed cells no longer carry the item error channel in their type.

`Workflow.andThen` now composes two total workflows (components whose error channel is `never`) into a total workflow. Error-carrying chains are unchanged.

`Workflow.make` and `Workflow.total` now refuse decision unions whose variants declare the family brand as a narrow unique-symbol type instead of the documented class-field idiom. Declare the brand as a `readonly [T] = T` field on each `S.TaggedClass` variant; decision unions written as interfaces carrying `typeof`-annotated brand fields are refused with `UnsharedTypeId`.
