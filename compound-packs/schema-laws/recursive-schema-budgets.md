---
title: Recursive schemas must declare an explicit recursionBudget to prevent superlinear generation traps
applies_when:
  - declaring recursive, tree-structured, or self-referential schemas with Schema.suspend
  - property-testing recursive unions or nested AST models
  - resolving timeouts or memory exhaustion in fast-check arbitrary generation
tags: [schema, recursive-schema, recursion-budget, fast-check, property-testing, oxlint-plugin-effect-schema]
---

Recursive schemas (e.g. JSON values, abstract syntax trees, nested directory trees, comment threads) inherently present exponential generation branching when fed to property test generators like fast-check.

### 1. The Superlinear Generation Hazard

When a recursive union carries multiple `Schema.suspend` branches, fast-check arbitrary generation explores branching paths superlinearly:

- Benchmarked: ~8 ms at 4 members, ~222 ms at 6 members, and >52 seconds at 8 members.
- Unchecked recursive arbitrary generation crashes test workers with out-of-memory errors or exceeds Vitest test timeouts.

### 2. Hoisting and `recursionBudget`

To guarantee deterministic, bounded test execution:

1. **Hoist to a Single Point**: Hoist multiple recursive branches to a single `Schema.suspend` at the recursion point rather than scattering suspensions across each union branch.
2. **Declare `recursionBudget`**: Attach a `recursionBudget` annotation defining `maxDepth` at the suspension point.
3. **Assert Generation Laws via `recursionLaws`**: Use `recursionLaws(name, schema)` (provided automatically by `@systemfsoftware/effect-schema-vite` or `@systemfsoftware/effect-schema-law`) to prove:
   - Generated values stay strictly inside the declared ceiling (`≤ maxDepth + 1`).
   - Deep values remain reachable (`stock deep-share ≠ 0`).
   - Every member of the recursion cycle remains inhabited.

```ts
// WRONG: Scattered suspensions with unconstrained recursive branching
export interface Tree {
  readonly val: string
  readonly left?: Tree
  readonly right?: Tree
}

export const Tree: S.Schema<Tree> = S.Struct({
  val: S.String,
  left: S.optional(S.suspend(() => Tree)),
  right: S.optional(S.suspend(() => Tree)),
}) // Lacks depth ceiling! Arbitrary generation will explode in property tests.

// RIGHT: Hoisted suspension with explicit recursionBudget annotation
import { Schema as S } from 'effect'

export interface JsonValue {
  readonly [key: string]: JsonValue | string | number | boolean | null
}

export const JsonValue: S.Schema<JsonValue> = S.suspend(
  () =>
    S.Union(
      S.String,
      S.Number,
      S.Boolean,
      S.Null,
      S.Record({ key: S.String, value: JsonValue }),
    ),
).annotations({
  recursionBudget: { maxDepth: 3, depthSize: 'small' },
})
```

Gate: `@systemfsoftware/oxlint-plugin-effect-schema` (`schema-recursive-union-budget`) and `recursionLaws` in `@systemfsoftware/effect-schema-law`.
