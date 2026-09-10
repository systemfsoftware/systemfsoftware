import { Schema as S } from 'effect'

/** @internal */
export const Alive = S.TaggedStruct('Alive', {})
/** @internal */
export type Alive = S.Schema.Type<typeof Alive>

/** @internal */
export const RemoveNow = S.TaggedStruct('RemoveNow', {})
/** @internal */
export type RemoveNow = S.Schema.Type<typeof RemoveNow>

/** @internal */
export const RemoveAfterTtl = S.TaggedStruct('RemoveAfterTtl', { ttlMillis: S.Finite })
/** @internal */
export type RemoveAfterTtl = S.Schema.Type<typeof RemoveAfterTtl>

/** @internal */
export const NodeFate = S.Union([Alive, RemoveNow, RemoveAfterTtl])
/** @internal */
export type NodeFate = Alive | RemoveNow | RemoveAfterTtl
