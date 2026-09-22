---
title: Generated property laws only prove acceptance; refusal boundaries require explicit negative tests
applies_when:
  - writing property tests or schema laws for domain models
  - authoring acceptance and refusal test suites for boundary adapters
  - reviewing schema validation coverage
tags: [boundary-testing, schema-laws, negative-testing, refusals, invariants]
---

Automated and generated schema laws (such as `@systemfsoftware/effect-schema-vite`'s `inlineSchemaTests()` or standard fast-check round-trip property tests) prove that valid data encodes and decodes symmetrically.

**Generated laws prove only what a type accepts. They are completely blind to what a domain type must reject.**

### 1. The Tautology of Generated Laws

A property test that generates an arbitrary instance of `OrderAmount` and asserts `decode(encode(amount)) === amount` proves that valid amounts round-trip. It does not prove:

- That `-10` is refused.
- That `0` is refused when amounts must be strictly positive.
- That `NaN` or `Infinity` fail decoding.

Widening a domain refinement (e.g. accidentally relaxing a constraint from positive integer to arbitrary number) leaves 100% of generated round-trip property tests passing green (`CONST-T10`).

### 2. Refusals Tested Beside Generators

Every schema that carries a refinement (`Schema.filter`, `Schema.Int`, `Schema.NonEmptyString`, or custom predicate) must ship an explicit negative test suite proving that invalid inputs are rejected:

- **Negative Oracles**: Assert that invalid literals fail `Schema.decodeUnknown` with a parse issue.
- **Boundary Edge Cases**: Explicitly pin the boundary values (e.g. `0`, `-1`, empty strings, un-trimmed whitespace, out-of-range timestamps).

```ts
// WRONG: Relying solely on generated arbitrary round-trip tests
// schema-laws.test.ts
// Generated test passes, but if a bug drops the positive filter, tests stay 100% green!

// RIGHT: Explicit refusal tests alongside the schema definition
// tests/OrderAmount.refusal.test.ts
import { Effect } from 'effect'
import * as Schema from 'effect/Schema'
import { describe, expect, it } from 'vitest'
import { OrderAmount } from '../src/OrderAmount.schema.js'

describe('OrderAmount refusal boundary', () => {
  it('refuses negative numbers', () => {
    const result = Schema.decodeUnknownEither(OrderAmount)(-1)
    expect(result._tag).toBe('Left')
  })

  it('refuses zero', () => {
    const result = Schema.decodeUnknownEither(OrderAmount)(0)
    expect(result._tag).toBe('Left')
  })

  it('refuses non-integer floats', () => {
    const result = Schema.decodeUnknownEither(OrderAmount)(10.5)
    expect(result._tag).toBe('Left')
  })
})
```

Gate: `review` — verify every refined schema or domain value object has a paired test suite asserting refusal of invalid inputs (`CONST-T10`).
