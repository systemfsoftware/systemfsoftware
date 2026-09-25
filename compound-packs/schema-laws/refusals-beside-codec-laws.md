---
title: Generated codec laws prove only acceptance; refined schemas must author explicit refusal suites
applies_when:
  - relying on generated schema property tests (ruleOfSchemas, inlineSchemaTests) for domain models
  - adding Schema.filter, Schema.pattern, or refinement checks to schemas
  - reviewing test suites for schema validation and invariant rejection
tags: [schema, refusals, negative-testing, tautological-laws, mutation-testing, effect-schema-law]
---

Automated and generated schema laws (such as `ruleOfSchemas` or `inlineSchemaTests`) generate test values directly from the schema's own arbitrary derivation.

### 1. The Tautology of Acceptance Laws

Because fast-check derives test samples from the schema's own generators:

- The generator produces **only values that satisfy the schema's filters and patterns**.
- A test asserting `decode(encode(x)) === x` over generated valid samples never presents an invalid input to `decode`.
- If a refinement (e.g. `S.pattern(/^[0-9a-f]+$/)` or `S.filter((n) => n > 0)`) is accidentally weakened or deleted, **100% of generated round-trip tests still pass**.

In mutation testing (Stryker), pattern-widening mutants survive completely against generated round-trip laws because generated laws are fundamentally tautological with respect to rejection.

### 2. Mandatory Refusal Tests Beside Laws

Every schema defining domain constraints or refinements must pair generated laws with an explicit negative refusal test suite (`*.refusal.test.ts` or `<name>.schema.property.test.ts`), complementing `compound-packs/boundary-testing/refusals-beside-generated-laws.md`:

- **Negative Domain Oracles**: Test inputs derived from the domain contract outside the allowed set (e.g., negative amounts, invalid characters, malformed UUIDs, expired timestamps).
- **Refusal Assertion**: Assert that `Schema.decodeUnknownEither` returns `Left` with a parse error when given rejected inputs.
- **Contract-Derived Generation**: In property rejection tests, generate from broad domain types (e.g. arbitrary strings or negative numbers) and assert unconditional failure to decode.

```ts
// WRONG: Relying solely on schema-laws.test.ts for a refined schema
// HexString.schema.ts
export const HexString = S.String.pipe(
  S.pattern(/^[0-9a-fA-F]+$/),
)
// If mutant widens /^[0-9a-fA-F]+$/ to admit 'g', round-trip laws stay 100% green!

// RIGHT: Refusal suite verifying rejection boundary
// HexString.refusal.test.ts
import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'
import { HexString } from './HexString.schema.js'

describe('HexString rejection boundaries', () => {
  it('refuses invalid hex characters', () => {
    const result = S.decodeUnknownEither(HexString)('0x123g')
    expect(result._tag).toBe('Left')
  })

  it('refuses empty strings when non-empty is required', () => {
    const result = S.decodeUnknownEither(HexString)('')
    expect(result._tag).toBe('Left')
  })
})
```

Gate: Stryker mutation coverage and `review` checking paired refusal suites for refined schemas (`CONST-T10`).
