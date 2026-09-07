---
'@systemfsoftware/all': minor
'@systemfsoftware/oxlint-plugin-effect-dmmf': minor
'@systemfsoftware/oxlint-plugin-effect-schema': minor
'@systemfsoftware/oxlint-plugin-cell-vocabulary': minor
'@systemfsoftware/oxlint-plugin-property-testing': minor
---

Five lint gates are now enabled at `error` in the recommended preset:

- A domain schema field holding a bare `String`, `Number`, `Boolean`, or `Unknown` is rejected. Every field must state what it accepts: a named stock shape (`NonEmptyString`, `Int`, `Finite`, `Literals`), a check refinement, or a brand naming the field's role.
- Role-branded fields are accepted; brands constructed with no decoding behind them (`Brand.nominal`, zero-argument `Brand.check()`) are rejected.
- Two `Cell.run` shapes are rejected: sequencing a second `Cell.run` off the first result inside one `Effect.gen` body, and piping `provideService` onto a `Cell.run` for a service that cell already demands.
- A property test whose predicate ignores the values it draws is rejected.
