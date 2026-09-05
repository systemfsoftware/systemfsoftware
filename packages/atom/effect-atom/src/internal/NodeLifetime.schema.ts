import { Schema as S } from 'effect'

/** @internal */
export const NodeFate = S.Union([
  S.TaggedStruct('Alive', {}),
  S.TaggedStruct('RemoveNow', {}),
  S.TaggedStruct('RemoveAfterTtl', { ttlMillis: S.Finite }),
])
/** @internal */
export type NodeFate = S.Schema.Type<typeof NodeFate>
