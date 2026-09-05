# @systemfsoftware/effect-schema-bounded-union

A recursive [Effect](https://effect.website) `Schema` union whose **generated values terminate**.

`Schema.Union` is generated as an unbounded `fc.oneof(...members)`. That is fine for a union of leaves, but a union that recurses through a non-array field — `Binary.left: Expression`, `Member.object: Expression` — can recurse until the call stack overflows. Anything that generates values from the schema then crashes before it does its job: a property test, an arbitrary-driven fuzz run, a fixture generator.

`boundedUnion` builds the same union with a depth cap on generation only. **Decode, encode and equivalence are identical to `Schema.Union`.** Past `maxDepth` (default `2`), generation collapses to the base case, so every variant stays reachable while the recursion always terminates.

```ts
import { boundedUnion } from '@systemfsoftware/effect-schema-bounded-union'
import { Schema as S } from 'effect'

const LitBase = S.TaggedStruct('Lit', { value: S.JsonNumber })
const AddBase = S.TaggedStruct('Add', {})

type Lit = S.Schema.Type<typeof LitBase>
type Add = S.Schema.Type<typeof AddBase> & {
  readonly left: Expr
  readonly right: Expr
}
type Expr = Lit | Add

const Add: S.Codec<Add> = S.suspend((): S.Codec<Add> => S.Struct({ ...AddBase.fields, left: Expr, right: Expr }))

export const Expr: S.Codec<Expr> = boundedUnion('Expr', {
  base: [LitBase],
  recur: [Add],
})
```

Split the members by whether they recurse: `base` holds the leaves and is used as the base case, `recur` holds the self-referential ones. The first argument is both the schema's `identifier` and the `depthIdentifier` the generator counts depth against — keep it unique per recursive cycle.

## Install

```bash
pnpm add @systemfsoftware/effect-schema-bounded-union
```

A regular **dependency**, not a devDependency: `boundedUnion` returns the codec your schema _is_, so the module that declares the schema imports it, and that module ships. `effect` is a peer dependency — you bring your own, so one copy of it decodes your whole application.

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/effect-schema-bounded-union#readme).
