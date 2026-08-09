import { Schema as S } from 'effect'

export const NodeFate = S.Union(
  S.TaggedStruct('Alive', {}),
  S.TaggedStruct('RemoveNow', {}),
  S.TaggedStruct('RemoveAfterTtl', { ttlMillis: S.Number }),
)
export type NodeFate = S.Schema.Type<typeof NodeFate>

export interface NodeLifetimeInput {
  readonly keepAlive: boolean
  readonly listenerCount: number
  readonly childCount: number
  readonly isLive: boolean
  readonly isWaiting: boolean
  readonly idleTTL: number | undefined
  readonly defaultIdleTTL: number | undefined
}

export const decideNodeFate = (input: NodeLifetimeInput): NodeFate =>
  input.keepAlive || input.listenerCount > 0 || input.childCount > 0 || !input.isLive || input.isWaiting
    ? { _tag: 'Alive' }
    : input.idleTTL !== 0 && (input.idleTTL !== undefined || input.defaultIdleTTL !== undefined)
    ? { _tag: 'RemoveAfterTtl', ttlMillis: input.idleTTL ?? input.defaultIdleTTL! }
    : { _tag: 'RemoveNow' }
