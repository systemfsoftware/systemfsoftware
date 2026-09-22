---
"@systemfsoftware/trace-taxonomy": minor
---

New package: a contracted span is declared once and started only through that declaration.

`Span.declare({ id, name, attrs })` takes an Effect Schema for the attribute record and returns a declared value whose `start(attributes)` wraps an effect in exactly the declared span name with exactly those attributes. Omitting or mistyping a declared attribute is a compile error, and a rename of the span name has one site.

`Taxonomy.make({ id, spans, edges, forbid })` composes declarations with `Edge.child` / `Edge.descendant` parent-child facts and forbidden spans. Membership carries no emit authority: a taxonomy describes what a behaviour is allowed to emit, and starting a span still happens through its declaration.

The package depends on `effect` alone — nothing here observes, exports, or collects a span.
