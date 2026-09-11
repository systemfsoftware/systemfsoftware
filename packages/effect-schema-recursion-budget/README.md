# @systemfsoftware/effect-schema-recursion-budget

A declared generation budget for recursive [Effect](https://effect.website) Schema unions. Instead of inheriting effect's hidden per-`Suspend` constant, the schema states its own: a ceiling (`maxDepth`), a shape (`depthSize`), and one depth identifier per recursive cycle. Generated values terminate inside the budget; decode, encode, and equivalence are untouched.

```ts
import { terminatingRecursion } from '@systemfsoftware/effect-schema-recursion-budget'
import { Schema as S } from 'effect'

const Leaf = S.TaggedStruct('Lit', { value: S.JsonNumber })

const Expr = terminatingRecursion({
  identifier: 'my-app.Expr',
  base: [Leaf],
  recur: [Add, Member],
  maxDepth: 6,
  depthSize: 'medium',
})
```

All five parameters are required — no signature defaults. `base` members are the terminal branch past the ceiling; member arbitraries derive lazily; deriving a recursive member while the union's own derivation is in flight folds to the base branch.

The budget travels with the schema, so `@systemfsoftware/effect-schema-law`'s `recursionLaws` can hold a generated suite to it, and the `schema-recursive-union-budget` lint rule treats the annotation as the declared-budget fix.

## Install

```bash
pnpm add @systemfsoftware/effect-schema-recursion-budget
```

`effect` is a peer dependency — you bring your own, so one copy of it derives your whole application's values.

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/effect-schema-recursion-budget#readme).
