export type UnobservedPrimitive = 'Queue' | 'PubSub' | 'Semaphore' | 'Latch' | 'Scope finalizer'

export interface Pruning {
  readonly enabled: boolean
  readonly disabledBy: ReadonlyArray<UnobservedPrimitive>
}

export interface Bound {
  readonly fibers: number
  readonly operations: number
  readonly preemptions: number
  readonly depth: number
  readonly runs: number
  readonly pruning: Pruning
}

export const pruned: Pruning = { enabled: true, disabledBy: [] }

export const unpruned = (disabledBy: ReadonlyArray<UnobservedPrimitive>): Pruning => ({
  enabled: false,
  disabledBy,
})
