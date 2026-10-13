# @systemfsoftware/effect-schema-recursion-budget

A recursive Effect Schema union declares its own generation budget as data, in stock Effect vocabulary:

```ts
import { Schema as S } from 'effect'

const Lit = S.TaggedStruct('Lit', { value: S.Finite })

export interface Wrap {
  readonly _tag: 'Wrap'
  readonly inner: Expr
}
export type Expr = S.Schema.Type<typeof Lit> | Wrap

export const Wrap: S.Schema<Wrap> = S.Struct({
  _tag: S.Literal('Wrap'),
  inner: S.suspend((): S.Schema<Expr> => Expr),
})

export const Expr: S.Schema<Expr> = S.suspend((): S.Schema<Expr> => S.Union([Lit, Wrap])).annotate({
  recursionBudget: { maxDepth: 6, depthSize: 'medium' },
})
```

One `Schema.suspend` at the recursion point, members referencing the union binding directly, and a `recursionBudget` annotation stating the ceiling (`maxDepth`) and the shape (`depthSize`) of the values the generator may draw. Decode, encode and equivalence are untouched — the budget governs generation only.

## What materializes it

`recursionBudgetTransform` is a Vite plugin. It rewrites a module that carries the annotation, injecting the `toCodecArbitrary` hook that honors it plus an import of the runtime that builds it:

- the terminal branch past the ceiling is every member the cycle cannot reach;
- the recursive branch is the union derived lazily per generated value, the same shape effect's own `Schema.suspend` derivation uses;

```ts
// vitest.config.ts
import { recursionBudgetTransform } from '@systemfsoftware/effect-schema-recursion-budget'

export default defineConfig({ plugins: [recursionBudgetTransform()] })
```

Register it in the Vitest configuration of every package whose tests draw values from a budgeted schema, as above. A hand-written `toCodecArbitrary` in the same annotation wins — the transform never overwrites a declared derivation.

The transform is the only thing that checks a declared budget. A malformed budget — a ceiling that is not a whole number ≥ 1, a shape outside `'small' | 'medium' | 'large'` — refuses the module at load with `recursionBudget: expected …`, and an annotation on a suspension that does not wrap a `Schema.Union`, or whose members all reach the cycle, refuses derivation with a named error. Without the transform neither check runs. Only `recursionLaws` from `@systemfsoftware/effect-schema-law` reports the missing registration, failing with `Budget_RequiresTransform`; a suite that does not run it gets no report. Effect's arbitrary derivation does not read the injected hook when it generates, so a drawn value's depth is bounded by the `size` the test passes, not by `maxDepth`.

## Install

```bash
pnpm add -D @systemfsoftware/effect-schema-recursion-budget
```

`effect` is a peer dependency — you bring your own, so one copy of it derives your whole application's values.

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/schema/effect-schema-recursion-budget#readme).
