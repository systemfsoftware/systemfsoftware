export type NodeFate =
  | { readonly _tag: 'Alive' }
  | { readonly _tag: 'RemoveNow' }
  | { readonly _tag: 'RemoveAfterTtl'; readonly ttlMillis: number }

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
