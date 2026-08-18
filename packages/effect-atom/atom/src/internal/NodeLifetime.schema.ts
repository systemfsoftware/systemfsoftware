import { Schema as S } from 'effect'

export const NodeFate = S.Union([
  S.TaggedStruct('Alive', {}),
  S.TaggedStruct('RemoveNow', {}),
  S.TaggedStruct('RemoveAfterTtl', { ttlMillis: S.Finite }),
])
export type NodeFate = S.Schema.Type<typeof NodeFate>
