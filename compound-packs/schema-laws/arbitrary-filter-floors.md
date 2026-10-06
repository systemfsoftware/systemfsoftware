---
title: A refined schema generates its values constructively, never by rejection sampling
applies_when:
  - adding a check or filter to a schema that property tests draw from
  - a property test times out, reports too many pre-condition failures, or runs far fewer cases than configured
  - a schema's valid domain is huge but tests need small values
tags: [schema-laws, fast-check, arbitrary, rejection-sampling, arbitraryConstraint]
---

A check whose predicate the arbitrary derivation cannot see generates by drawing base values and discarding failures. When few base values pass (a pattern, a narrow range, a cross-field invariant), fast-check exhausts its discard budget or the suite silently runs far fewer cases than it claims.

## Rule

Give every check a generator that produces only passing values:

1. **Use the built-in checks** (`S.isBetween`, `S.isGreaterThanOrEqualTo`, `S.isMinLength`, `S.isPattern`, …). They carry `arbitraryConstraint` metadata, and the derivation reads it. `S.isPattern` generates constructively only from the regex subset the derivation parses. A lookahead or lookbehind (`(?=`, `(?!`, `(?<=`, `(?<!`), `\b` outside a character class, `\B`, a backreference (`\1`, `\k<name>`), or the `i`, `m` or `v` flag makes it drop the pattern and fall back to rejection sampling. Nothing reports the fallback: `Arbitrary.sampleEffect` fails with `SampleError` after its discard budget, and a property test reports `PropertyRefuted` with "Failing step: no step ran". Write such a pattern without the unsupported construct (`[A-Za-z]` for `i`), or make the type an `S.declare` with `toCodecArbitrary`.
2. **Custom predicates** carry `arbitraryConstraint` in their `S.makeFilter` / `S.makeFilterGroup` annotations when the predicate maps to the constraint vocabulary (length, range, pattern, integer, unique). A range (`minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`) on a number, a bigint or a `BigDecimal` also carries the type's `order`: `Order.Number`, `Order.BigInt` or `BigDecimal.Order`. The derivation reads those bounds only when the constraint's `order` is that instance. A range without one is used only if another check on the same schema supplies the `order`; otherwise it is dropped, and the type's full domain is generated.
3. **Sparse invariants** that do not map to that vocabulary become `S.declare` with a `toCodecArbitrary` annotation that builds valid values directly.

To keep generated values small while the decoded domain stays wide, add a generation-only filter that never rejects and only steers the generator:

```ts
import { Order, Schema } from 'effect'

const generatedBetween = (minimum: number, maximum: number) =>
  Schema.makeFilter<number>(() => undefined, { arbitraryConstraint: { order: Order.Number, minimum, maximum } })

const NonNegativeSafeInt = Schema.Int.pipe(
  Schema.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })),
)

// Decodes any non-negative safe integer; property tests draw at most one minute.
export const Millis = NonNegativeSafeInt.pipe(Schema.check(generatedBetween(0, 60_000)))
```

Working example: `packages/daemon/effect-daemon-spec/src/kernel/SupervisionLimits.schema.ts`.

Gate: `@systemfsoftware/oxlint-plugin-effect-schema` rule `schema-filter-constructive-generation` reports a filter declared or exported without this metadata.
