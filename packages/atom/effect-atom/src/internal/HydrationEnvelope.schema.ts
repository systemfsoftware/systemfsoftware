import { Schema as S } from 'effect'

/** @internal */
export const DehydratedAtomValue = S.Struct({
  '~effect/reactivity/DehydratedAtom': S.Literal(true),
  key: S.String,
  value: S.Unknown,
  dehydratedAt: S.Finite,
})
/** @internal */
export type DehydratedAtomValue = S.Schema.Type<typeof DehydratedAtomValue>
