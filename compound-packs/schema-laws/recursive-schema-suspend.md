---
title: A recursive schema closes its cycle with Schema.suspend and declares its recursion budget at the recursion point
applies_when:
  - authoring a schema with self-referential or mutually recursive structure (trees, ASTs, nested categories, JSON-like values)
  - a module throws ReferenceError at load, or TypeScript reports TS7022 / TS7024 on a schema
  - property tests of a recursive schema hang, run out of memory, or never produce deep values
tags: [schema-laws, recursive-schema, suspend, recursionBudget, effect-schema-recursion-budget]
---

Referencing a schema constant inside its own initializer reads the binding before it exists: a runtime `ReferenceError`, or TS7022 / TS7024 when the type is inferred through the cycle. Generation has its own failure: a recursive union derived with no ceiling grows superlinearly in its member count.

## Rule

1. **Close every back-reference with `Schema.suspend`**, and give the suspension and the exported constant an explicit `Schema.Codec<T>` annotation over a hand-written `interface T`, so the compiler never infers through the cycle.
2. **Hoist to one recursion point.** Put a single `Schema.suspend` around the union that is the cycle, and let members refer back to it.
3. **Declare the ceiling there** with `recursionBudget: { maxDepth, depthSize }` (`depthSize` is `'small' | 'medium' | 'large'`). `@systemfsoftware/effect-schema-vite` materializes the derivation hook, and the generated `recursionLaws` check that values stay under the ceiling, deep values stay reachable, and every member stays inhabited.

```ts
import { Schema } from 'effect'
// SemanticAst is a non-recursive leaf schema declared in the same file.

export type PatternAst = SemanticAst | AndAst | NotAst
export interface AndAst {
  readonly kind: 'And'
  readonly patterns: ReadonlyArray<PatternAst>
}
export interface NotAst {
  readonly kind: 'Not'
  readonly pattern: PatternAst
}

export const AndAst = Schema.Struct({
  kind: Schema.Literal('And'),
  patterns: Schema.Array(Schema.suspend((): Schema.Codec<PatternAst> => PatternAst)),
})

export const NotAst = Schema.Struct({
  kind: Schema.Literal('Not'),
  pattern: Schema.suspend((): Schema.Codec<PatternAst> => PatternAst),
})

export const PatternAst: Schema.Codec<PatternAst> = Schema.suspend((): Schema.Codec<PatternAst> =>
  Schema.Union([SemanticAst, AndAst, NotAst])
).annotate({ recursionBudget: { maxDepth: 6, depthSize: 'small' } })
```

Working example: `packages/discern/src/PatternAst.schema.ts`.

Gate: TypeScript (TS7022 / TS7024) for the missing annotation; `@systemfsoftware/oxlint-plugin-effect-schema` rule `schema-recursive-union-budget` for the missing budget; the generated `recursionLaws` for a budget the derivation does not honor.
