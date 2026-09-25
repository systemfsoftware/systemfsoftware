---
title: Exported domain schemas must satisfy round-trip identity and encode stability laws
applies_when:
  - declaring or exporting an Effect Schema codec for domain models or boundary entities
  - reviewing property tests for domain schema codecs
  - authoring custom schema transformations, brands, or encodings
tags: [schema, codec-laws, round-trip, encode-stability, effect-schema-law, property-testing]
---

An Effect `Schema<A, I, R>` defines a bidirectional morphism between encoded representations `I` and decoded domain values `A`. Every exported schema representing domain entities, values, or wire contracts must obey the two fundamental codec laws:

### 1. The Two Codec Laws

1. **Round-Trip Identity**: Decoding an encoded value recovers the original value identically:
   $$\forall a \in A, \quad \operatorname{decode}(\operatorname{encode}(a)) = a$$
   Furthermore, for any two values $a, a' \in A$, $\operatorname{decode}(\operatorname{encode}(a)) = \operatorname{decode}(\operatorname{encode}(a')) \iff a = a'$.
2. **Encode Stability**: Encoding a decoded value produces an encoded form that remains idempotent under repeated re-encoding:
   (Injectivity across distinct values follows directly from the round-trip identity: $\operatorname{decode}(\operatorname{encode}(a)) = \operatorname{decode}(\operatorname{encode}(a')) \iff a = a'$).

If encoding alters canonical representations or decoding strips essential semantic invariants, data loss or non-convergent mutations occur across service boundaries.

### 2. Verification via `ruleOfSchemas`

Use `ruleOfSchemas` from `@systemfsoftware/effect-schema-law` to register fast-check property tests asserting both laws across 100+ generated inputs per schema:

```ts
// WRONG: Untested custom transformation risking asymmetry or data loss
import { Schema as S } from 'effect'

export const DateFromNumber = S.transform(
  S.Number,
  S.DateFromSelf,
  {
    decode: (n) => new Date(n),
    encode: (d) => Math.floor(d.getTime() / 1000), // Loss of millisecond precision breaks round-trip identity!
  },
)

// RIGHT: Symmetric codec verified by ruleOfSchemas
import { ruleOfSchemas } from '@systemfsoftware/effect-schema-law'
import { Schema as S } from 'effect'

export const DateFromNumber = S.transform(
  S.Number,
  S.DateFromSelf,
  {
    decode: (n) => new Date(n),
    encode: (d) => d.getTime(), // Exact millisecond round-trip
  },
)

// In vitest suite or schema-laws.test.ts
ruleOfSchemas('DateFromNumber', DateFromNumber)
```

Gate: `pnpm --filter <pkg> test` running `ruleOfSchemas` via `@systemfsoftware/effect-schema-law`.
