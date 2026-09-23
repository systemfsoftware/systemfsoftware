## 0.0.0

### Minor Changes

- New package: a contracted span is declared once and started only through that declaration.

  `Span.declare({ id, name, attrs })` takes an Effect Schema for the attribute record and returns a Pipeable declaration. `Span.start(span, attributes)` is a dual combinator — `effect.pipe(Span.start(span, attributes))` or `Span.start(effect, span, attributes)` — that wraps the effect in exactly the declared name with exactly those attributes. Omitting or mistyping a declared attribute is a compile error, and the declared name keeps its literal type.

  `Taxonomy.make(id)` starts an immutable staged builder; `add`, `child`, `descendant`, and `forbid` are dual combinators that declare the spans they cite, deduped by id. A forbidden span's `unless` escape is an `Option`. Membership carries no emit authority: a span still starts through its declaration.

  Depends on `effect` alone.
