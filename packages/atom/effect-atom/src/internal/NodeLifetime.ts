import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
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
  const ttl = Option.fromUndefinedOr(input.idleTTL ?? input.defaultIdleTTL)
  return Match.value({
    alive: input.keepAlive || input.listenerCount > 0 || input.childCount > 0 || !input.isLive || input.isWaiting,
    zeroIdle: input.idleTTL === 0,
    hasTtl: Option.isSome(ttl),
  }).pipe(
    Match.when({ alive: true, zeroIdle: Match.any, hasTtl: Match.any }, () => ({ _tag: 'Alive' as const })),
    Match.when({ alive: false, zeroIdle: true, hasTtl: Match.any }, () => ({ _tag: 'RemoveNow' as const })),
    Match.when({ alive: false, zeroIdle: false, hasTtl: false }, () => ({ _tag: 'RemoveNow' as const })),
    Match.when({ alive: false, zeroIdle: false, hasTtl: true }, () => ({
      _tag: 'RemoveAfterTtl' as const,
      ttlMillis: Option.getOrThrow(ttl),
    })),
    Match.exhaustive,
  )
}
