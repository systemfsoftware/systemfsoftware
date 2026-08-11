# @systemfsoftware/effect-schema-law

Codec-law property tests for [Effect](https://effect.website) `Schema`, in one call.

A schema is a two-way codec. `ruleOfSchemas` asserts the two laws every well-formed codec must obey, generating its inputs from the schema itself (via `@effect/vitest`'s `it.prop` + fast-check):

- **Round-trip identity** — `decode(encode(x))` equals `x` (by the schema's type equivalence).
- **Encode stability** — re-encoding the decoded value reproduces the original encoded form (by the encoded-side equivalence).

```ts
import { ruleOfSchemas } from '@systemfsoftware/effect-schema-law'
import { Schema as S } from 'effect'

const Email = S.String.pipe(S.brand('Email'))

// inside a Vitest file — registers two property tests
ruleOfSchemas('Email', Email)
```

## Recursive schemas

`ruleOfSchemas` generates its inputs from the schema. Effect bounds that generation at array seams, but a **union that recurses through a non-array field** — `Binary.left: Expression`, `Member.object: Expression` — is generated as an unbounded `fc.oneof(...members)`. A single sample can then recurse until the call stack overflows, and the test crashes before it ever checks a law.

`boundedUnion` builds the same union — decode, encode, and equivalence are identical to `S.Union(...)` — but caps generation depth. Past `maxDepth` (default `2`), generation collapses to the base case, so every variant stays reachable while the recursion always terminates. Split the members into the non-recursive `base` (the leaves, used as the base case) and the self-referential `recur`:

```ts
import { ruleOfSchemas, Weakening } from '@systemfsoftware/effect-schema-law'
import { Schema as S } from 'effect'

interface Lit {
  readonly _tag: 'Lit'
  readonly value: number
}
interface Add {
  readonly _tag: 'Add'
  readonly left: Expr
  readonly right: Expr
}
type Expr = Lit | Add

const Lit = S.Struct({ _tag: S.Literal('Lit'), value: S.JsonNumber })
const Add: S.Schema<Add> = S.suspend((): S.Schema<Add> => S.Struct({ _tag: S.Literal('Add'), left: Expr, right: Expr }))

const Expr: S.Schema<Expr> = Weakening.boundedUnion('Expr', {
  base: [Lit],
  recur: [Add],
})

ruleOfSchemas('Expr', Expr) // generates and law-tests, no stack overflow
```

The first argument is both the schema's `identifier` and the `depthIdentifier` fast-check counts depth against — keep it unique per recursive cycle.

## Install

```bash
pnpm add -D @systemfsoftware/effect-schema-law
```

Install it as a **devDependency** — it's a test helper. `effect`, `vitest`, and `@effect/vitest` are peer dependencies: you bring your own (you already have them to run your tests), so the helper shares your single test-runner instance. Call `ruleOfSchemas(name, schema)` at the top level of a Vitest test file; it registers the two `it.prop` cases for you.
