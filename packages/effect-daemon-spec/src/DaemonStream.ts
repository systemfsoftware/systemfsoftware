import { WorkerTypeId } from './Brands.js'
import { StreamLoopTag } from './LoopTags.js'

type WorkerRecord<TICK, THOOKS, CHILD, LCK, L> = {
  readonly [WorkerTypeId]: WorkerTypeId
  readonly name: string
  readonly loop: L
  readonly child: CHILD | Record<never, never>
  readonly tick: TICK
  readonly tickHooks: THOOKS | Record<never, never>
  readonly lock: LCK
}

const orEmpty = <A>(value: A | undefined): A | Record<never, never> => {
  if (typeof value === 'undefined') {
    return {}
  }
  return value
}

export const stream = <
  S,
  TICK,
  THOOKS,
  CHILD,
  LCK,
  O extends {
    readonly name: string
    readonly stream: S
    readonly tick: TICK
    readonly tickHooks?: THOOKS
    readonly child?: CHILD
    readonly lock: LCK
  },
>(opts: O): WorkerRecord<TICK, THOOKS, CHILD, LCK, StreamLoopTag & { readonly stream: S }> => ({
  [WorkerTypeId]: WorkerTypeId,
  name: opts.name,
  loop: { ...StreamLoopTag, stream: opts.stream },
  child: orEmpty(opts.child),
  tick: opts.tick,
  tickHooks: orEmpty(opts.tickHooks),
  lock: opts.lock,
})
