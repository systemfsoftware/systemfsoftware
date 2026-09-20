# Cross-Field Schema Invariants and Arbitrary Derivation

## Context

Effect Schema v4 (measured against rc.116 in `repos/effect/packages/effect`) provides arbitrary derivation via its internal compiler at `src/internal/arbitrary/schema.ts`. When a schema carries a refinement filter via `.check(Schema.makeFilter(...))`, the compiler either uses constructive metadata attached to the filter to generate compliant values directly, or falls back to rejection sampling (discarding non-matching values).

The `schema-filter-constructive-generation` oxlint rule ensures that filters declare their generation behavior rather than silently generating by rejection sampling.

## What Was Measured

Inspection of `repos/effect/packages/effect/src/internal/arbitrary/schema.ts` reveals the exact compiler mechanisms:

1. **`collectChecks`:** Reads only `arbitraryConstraint` annotations. The recognized constraint keys are strictly per-value properties:
   - `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `order` (ranges)
   - `minLength`, `maxLength` (strings)
   - `minSize`, `maxSize` (collections)
   - `minProperties`, `maxProperties` (records/structs)
   - `patterns` (regex)
   - `number` ('integer')
   - `uniqueBy` (uniqueness)

   None of these keys can express relational or cross-field predicates (such as `low <= high` or `startDate < endDate`).

2. **`compileDeclaration`:** Sole reader of `ast.annotations?.toCodecArbitrary`. This hook is typed for `Annotations.Declaration` and is honored _only_ when the AST node is a `Schema.declare` declaration. An `.annotate({ toCodecArbitrary })` call on a scalar (`Schema.String`) or a struct (`Schema.Struct`) is completely inert — the compiler never reads `toCodecArbitrary` from `SchemaAST.TypeAST` or `SchemaAST.ObjectKeyword` nodes.

3. **`applyFilters`:** Implements rejection sampling bounded by `maxDiscards` (default 100). When a filter carries no constructive generator, the compiler draws candidate values from the underlying type and runs the predicate. If `maxDiscards` consecutive draws fail the predicate, generation aborts with an exhaustion error.

## Guidance: The Dual Path

Because the compiler provides no constructive hook for struct-level filters, invariants fall into two distinct density regimes:

### 1. Dense Invariants: Natural Rejection Sampling

When a cross-field predicate accepts a significant proportion of random draws (typically ≥20%, e.g., `low <= high` where `low, high ∈ [0, 100]` has an acceptance rate of ~50.5%), rejection sampling will find a valid draw within a few attempts, well below `maxDiscards`.

For these predicates, rejection sampling is the intended and performant engine mechanism in Effect v4. The `schema-filter-constructive-generation` rule recognizes that Effect provides no constructive metadata for struct receivers, and permits bare filters on struct and record types without requiring ritual or fake annotations:

```typescript
import { Schema } from 'effect'

const LowHigh = Schema.Struct({
  low: Schema.Int,
  high: Schema.Int,
}).check(
  Schema.makeFilter((p) => p.low <= p.high),
)
```

### 2. Sparse Invariants: `Schema.declare` with `toCodecArbitrary`

When a cross-field predicate accepts a negligible fraction of draws (e.g., `hash(payload) === signature`), rejection sampling will hit `maxDiscards` and fail test generation.

Because `.annotate({ toCodecArbitrary })` is inert on a `Schema.Struct`, the invariant must be modeled as a `Schema.declare` node where `toCodecArbitrary` is compiled:

```typescript
import { Arbitrary, FastCheck, Schema, SchemaAST } from 'effect'

const SparsePair = Schema.declare(
  [],
  {
    decode: (input) => /* validate low and high */,
    encode: (pair) => pair,
  },
  {
    toCodecArbitrary: () =>
      SchemaAST.link(
        Arbitrary.make(
          FastCheck.integer().chain((low) =>
            FastCheck.integer({ min: low }).map((high) => ({ low, high })),
          ),
        ),
      ),
  },
)
```

## Related

- `docs/solutions/architecture-patterns/a-schema-type-claim-can-outrun-its-examination.md`
- `docs/solutions/architecture-patterns/an-escape-hatch-is-an-unfalsified-hypothesis.md`
- `CONCEPTS.md` — `Residual filter`
