---
title: Schema filter predicates must carry explicit arbitrary generators to prevent fast-check rejection traps
applies_when:
  - adding Schema.filter or refinement predicates to domain types tested with fast-check
  - writing Arbitrary generators for property tests
  - debugging property test timeouts or silent test exhaustion
tags: [boundary-testing, property-tests, fast-check, arbitrary, rejection-traps]
---

When property-testing schemas with domain filters, relying on naive generator filtering (`fc.pre` or unconstrained `.filter()`) creates **rejection traps**:

### 1. The Fast-Check Rejection Trap

Fast-check attempts to generate valid samples by repeatedly sampling a base generator and discarding values that fail the filter predicate. If the acceptance ratio is small (e.g. valid order IDs matching a regex, future timestamps within a tight window, or cross-field constraints):

- Fast-check exceeds its max failure budget (default 100 consecutive rejections) and throws `Too many pre-condition failures`.
- Worse, test suites configured with lenient filters or short timeouts will complete with fewer effective runs than configured, giving false confidence on edge cases.

### 2. Explicit Arbitrary Derivation

When a schema defines a refined constraint, provide an explicit `Arbitrary` or construct the generator from constrained primitives rather than post-generation rejection:

- **Generate Valid Inputs Directly**: Use bounded generators (e.g. `fc.integer({ min: 1, max: 1000 })`) instead of `fc.integer().filter(n => n > 0)`.
- **Targeted Combinators**: Use `Schema.Annotations` with `arbitrary` annotations when deriving property tests for schemas with custom filters.

```ts
// WRONG: Post-generation rejection discards 99% of samples, leading to test failure or vacuous suites
const ExpiringToken = Schema.String.pipe(
  Schema.filter((s) => s.startsWith('tok_') && s.length === 32), // Fast-check will fail generating this!
)

// RIGHT: Explicit generator attached via Schema annotations or custom Arbitrary
import * as FastCheck from 'effect/FastCheck'

const ExpiringToken = Schema.String.pipe(
  Schema.filter((s) => s.startsWith('tok_') && s.length === 32),
  Schema.annotations({
    arbitrary: () => (fc: typeof FastCheck) =>
      fc.stringOf(fc.constantFrom(...'0123456789abcdef'), { minLength: 28, maxLength: 28 })
        .map((hex) => `tok_${hex}`),
  }),
)
```

Gate: `review` — verify filtered schemas tested under property tests attach explicit bounded generators and do not exhaust fast-check rejection budgets.
