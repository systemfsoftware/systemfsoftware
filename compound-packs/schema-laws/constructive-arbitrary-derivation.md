---
title: Filtered schemas must carry constructive arbitrary metadata to prevent fast-check rejection traps
applies_when:
  - adding Schema.filter or refinement predicates to schemas tested with fast-check
  - configuring fast-check arbitrary annotations for custom schemas
  - debugging test timeouts caused by "Too many pre-condition failures"
tags: [schema, fast-check, arbitrary, rejection-traps, constructive-generation, oxlint-plugin-effect-schema]
---

When fast-check generates property test inputs for a schema with refinements (`Schema.filter`), default derivation relies on rejection sampling: repeatedly drawing random values until one passes the predicate.

### 1. The Rejection Trap Hazard

If a filter has a low acceptance probability (e.g. string matching a specific pattern, future timestamp, valid checksum):

- Fast-check discards candidate after candidate until exceeding the default 100 consecutive discard limit.
- Vitest fails with: `Error: Property failed after 0 tests (Too many pre-condition failures)`.
- Or, if configured with loose tolerances, the property test silently exercises almost zero valid cases, creating vacuous green suites.

### 2. Constructive Derivation Requirements

In accordance with `@systemfsoftware/oxlint-plugin-effect-schema` rule `schema-filter-constructive-generation`:

1. **Constraint Annotations**: Attach `arbitraryConstraint` at `Schema.makeFilter` / `Schema.makeFilterGroup` annotations when the predicate maps to the standard constraint vocabulary (length, range, pattern, integer, unique).
2. **Schema.declare with toCodecArbitrary**: For sparse or complex invariants that cannot map to scalar constraint vocabulary, declare via `Schema.declare` with an explicit `toCodecArbitrary` derivation hook.
3. **Direct Arbitrary Annotations**: Alternatively, attach an explicit fast-check generator via `Schema.annotations({ arbitrary: () => (fc) => ... })` directly on the schema node to generate valid members constructively without discards.

// RIGHT: Filter with constructive arbitrary generation annotation
import { Schema as S } from 'effect'
import * as FastCheck from 'effect/FastCheck'

export const PortNumber = S.Number.pipe(
S.filter((n) => Number.isInteger(n) && n >= 1 && n <= 65535),
S.annotations({
arbitrary: () => (fc: typeof FastCheck) => fc.integer({ min: 1, max: 65535 }),
}),
)

```
Gate: `@systemfsoftware/oxlint-plugin-effect-schema` (`schema-filter-constructive-generation`).
```
