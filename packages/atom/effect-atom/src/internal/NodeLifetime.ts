import type { NodeFate } from './NodeLifetime.schema.js'

/** @internal */
export interface NodeLifetimeInput {
  readonly keepAlive: boolean
  readonly listenerCount: number
  readonly childCount: number
  readonly isLive: boolean
  readonly isWaiting: boolean
  readonly idleTTL: number | undefined
  readonly defaultIdleTTL: number | undefined
}

/** @internal */
export const decideNodeFate = (input: NodeLifetimeInput): NodeFate => {
  if (input.keepAlive || input.listenerCount > 0 || input.childCount > 0 || !input.isLive || input.isWaiting) {
    return { _tag: 'Alive' }
  }
  if (input.idleTTL === 0) {
    return { _tag: 'RemoveNow' }
  }
  const ttlMillis = input.idleTTL ?? input.defaultIdleTTL
  return ttlMillis === undefined ? { _tag: 'RemoveNow' } : { _tag: 'RemoveAfterTtl', ttlMillis }
}
