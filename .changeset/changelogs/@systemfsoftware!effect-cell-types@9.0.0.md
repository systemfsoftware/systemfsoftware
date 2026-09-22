## 9.0.0

### Major Changes

- `Sandwich.read` is now `Sandwich.named(name)`. The name is the parent span. The run also records `<name>.read` and `<name>.write`, the decision or failure tag, and a histogram `app.<name>.duration` labeled only by result class (`success`, `failure`, or `infrastructure`). Pass `{ boundaries }` to override the default duration buckets, in seconds.

  A command class passed to `Workflow.make` or `Workflow.total` declares the fields copied onto the span as `static readonly [Workflow.InstrumentationBrand] = [...] as const`. A missing list, or a key that is not a field of the class, is refused.

  A failure inside a cell carries the span annotation on its cause, as any effect inside a span does.

### Patch Changes

- Re-export the `Cell` type under the `Sandwich` namespace so downstream declaration emit can infer portable return types for `Sandwich` combinator chains without explicit type annotations.

- Unconstrained type holes are defaulted type parameters (`<A = unknown>`) instead of a type argument `unknown`. Calls that omit those arguments are unchanged.
