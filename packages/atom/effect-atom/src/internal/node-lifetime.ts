import type { NodeFate } from './node-lifetime.schema.js'

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

const isPinned = (input: NodeLifetimeInput): boolean => {
  const flags = [
    input.keepAlive,
    input.listenerCount > 0,
    input.childCount > 0,
    !input.isLive,
    input.isWaiting,
  ]
  return flags.includes(true)
}

const fateFromDefaultTtl = (ttlMillis: number | undefined): NodeFate => {
  if (ttlMillis === undefined) {
    return { _tag: 'RemoveNow' }
  }
  return { _tag: 'RemoveAfterTtl', ttlMillis }
}

const fateFromIdleTtl = (input: NodeLifetimeInput): NodeFate => {
  const ttlMillis = input.idleTTL
  if (ttlMillis === undefined) {
    return fateFromDefaultTtl(input.defaultIdleTTL)
  }
  return { _tag: 'RemoveAfterTtl', ttlMillis }
}

const fateFromTtl = (input: NodeLifetimeInput): NodeFate => {
  if (input.idleTTL === 0) {
    return { _tag: 'RemoveNow' }
  }
  return fateFromIdleTtl(input)
}

/** @internal */
export const decideNodeFate = (input: NodeLifetimeInput): NodeFate => {
  if (isPinned(input)) {
    return { _tag: 'Alive' }
  }
  return fateFromTtl(input)
}
