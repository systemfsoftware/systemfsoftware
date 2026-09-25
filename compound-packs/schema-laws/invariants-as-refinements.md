---
title: A value with a domain invariant is refined at decode, and branded when it carries domain meaning
applies_when:
  - declaring a schema field whose values obey a rule (non-negative, bounded, an id format, a closed set)
  - a decider, handler, or cell range-checks, regex-tests, or re-validates a value it already decoded
  - a test needs a refined schema for a concept that production keeps as a bare primitive
  - reviewing a schema whose fields are bare `String`, `Number`, `Finite`, or `Int` in domain positions
tags: [schema-laws, refinements, brands, invariants, anemic-schema, illegal-states]
---

A bare `Schema.Number` for a quantity accepts `-3`, `NaN`, and `1e308`. Every consumer then has to re-check it, and the one that forgets carries the defect. `CONSTITUTION.md` asks for illegal states to be unrepresentable and for values with domain meaning to be branded; this rule applies that to Effect Schema.

## Rule

1. **Refine the value where it is declared.** A field whose domain has a rule gets that rule as a check: built-in checks first (`S.isBetween`, `S.isGreaterThanOrEqualTo`, `S.isPattern`, `S.isInt`), or `S.Literals` for a closed set. A custom `S.makeFilter` states its invariant as a domain sentence in its `message` or `expected` annotation, so a decode failure names the broken rule instead of "Expected <filter>".
2. **Brand it when it means something in the domain.** A refined value that stands for a domain concept (`StatusCode`, `Probability`, `Money`) takes `S.brand`, so a plain number cannot be passed where the concept is expected. A brand with no refinement under it is a type claim nothing examined; see `docs/solutions/architecture-patterns/a-schema-type-claim-can-outrun-its-examination.md`.
3. **Leave a primitive with no invariant bare.** A free-text label or an opaque token needs no check. Refining every primitive adds refusal properties that test nothing.
4. **The symptom is the trigger.** Consuming code that re-checks a decoded value (`if (n < 0)`, `/^2\d\d/.test(line)`) means the invariant lives in the wrong place. Move it into the schema and delete the consumer check; do not keep it as a backup. A test that declares its own refined version of a concept production keeps bare has found the same gap: the refinement belongs in production (`tests-own-no-schemas`).

Each refinement added under this rule carries a refusal property (`refusals-beside-generated-laws`) and generates constructively (`arbitrary-filter-floors`).

```ts
import { Schema as S } from 'effect'

export const StatusCode = S.Int.pipe(
  S.check(
    S.isBetween({ minimum: 100, maximum: 599 }, { message: 'an HTTP status code is an integer between 100 and 599' }),
  ),
  S.brand('StatusCode'),
)
```

Working example: `packages/effect-readiness/src/DialEvidence.schema.ts`.

Gate: `review`.
