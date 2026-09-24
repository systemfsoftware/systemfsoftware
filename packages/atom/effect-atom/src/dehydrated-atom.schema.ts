import { Schema as S } from 'effect'

/**
 * Wire shape of one dehydrated atom entry; hydration decodes every incoming
 * entry through it.
 *
 * @since 4.0.0
 */
export const DehydratedAtomValue = S.Struct({
  '~effect/reactivity/DehydratedAtom': S.Literal(true),
  key: S.String,
  value: S.Unknown,
  dehydratedAt: S.Finite,
})
/**
 * @since 4.0.0
 */
export type DehydratedAtomValue = S.Schema.Type<typeof DehydratedAtomValue>
