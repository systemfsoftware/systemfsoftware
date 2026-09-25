import { Schema as S } from 'effect'

export const Leaf = S.Struct({ kind: S.Literal('Leaf'), value: S.Finite })
export type Leaf = S.Schema.Type<typeof Leaf>

export interface Wrap {
  readonly kind: 'Wrap'
  readonly inner: Bad
}

export type Bad = Leaf | Wrap

export const Wrap: S.Schema<Wrap> = S.Struct({
  kind: S.Literal('Wrap'),
  inner: S.suspend((): S.Schema<Bad> => Bad),
})

export const Bad: S.Schema<Bad> = S.suspend((): S.Schema<Bad> => S.Union([Leaf, Wrap])).annotate({
  recursionBudget: { maxDepth: 'six', depthSize: 'small' },
})
