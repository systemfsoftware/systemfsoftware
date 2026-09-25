---
title: Generated schema laws prove only acceptance; a refined schema states its refusals in its own file
applies_when:
  - adding a check, pattern, bound, or brand refinement to a schema
  - relying on the generated schema-laws.test.ts suite to verify a schema
  - reviewing whether a schema's rejection boundary is tested
tags: [schema-laws, refusals, negative-testing, refinements, effect-schema-law]
---

The generated `schema-laws.test.ts` suite (`@systemfsoftware/effect-schema-vite` calling `ruleOfSchemas`) draws every input from the arbitrary the schema itself derives. It proves that accepted values round-trip. It never presents a value the schema must refuse.

Widening a refinement (`isGreaterThanOrEqualTo(0)` dropped, a pattern character class extended) leaves every generated law green. `docs/solutions/design-patterns/generated-schema-laws-are-tautological.md` records the hex-schema case: every `S.pattern` mutant survived the generated laws.

## Rule

Every schema carrying a refinement states its refusal boundary as a property in the schema's own file, inside an `if (import.meta.vitest !== void 0)` block:

- Draw candidates from the **unrefined base type** (`S.Finite`, `S.String`), never from the refined schema.
- Compare the decode verdict against an independent predicate written from the domain contract, not copied from the refinement.
- Append the boundary seeds (`-1`, `0`, the maximum, `NaN`, infinities, the empty string) to every draw so the edges are always exercised.

Do not add a separate refusal test file under `src/`. The test-discipline lint (`no-test-file-in-src`, `src-property-test-cell`) bans `*.schema.test.ts` and `*.schema.property.test.ts` there, and names the in-source block as the place for refusals.

```ts
// credit.schema.ts
/// <reference types="vitest/importMeta" />
import { Schema as S } from 'effect'
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'

export const Amount = S.Finite.pipe(S.check(S.isGreaterThanOrEqualTo(0)))

const seeds = [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0]
const nonNegativeFinite = (n: number): boolean => Number.isFinite(n) && n >= 0
const amountDecodes = (n: number): boolean => Result.isSuccess(S.decodeResult(Amount)(n))

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀n_AmountRefusal_≡NonNegative',
    { of: [S.Finite], subject: amountDecodes },
    (subject, [value]) => Arr.every(Arr.append(seeds, value), (n) => subject(n) === nonNegativeFinite(n)),
  )
}
```

Working example: `examples/inventory-fulfillment/src/fulfillment/credit.schema.ts`.

Gate: `review`. The refusal property must fail when the refinement is widened; check it by widening the refinement locally once.
