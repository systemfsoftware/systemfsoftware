import { Effect } from 'effect'
import { WorkerTypeId } from './Brands.js'
import type { SubscriptionLoop } from './DaemonSpec.schema.js'
import { SubscriptionLoopTag } from './LoopTags.js'

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
type AnyEffect<E, R, A = unknown> = Effect.Effect<A, E, R>

export const subscription = <
  AE,
  AR,
  ACQ extends AnyEffect<AE, AR>,
  TICK,
  THOOKS,
  CHILD,
  LCK,
  O extends {
    readonly name: string
    readonly acquire: ACQ
    readonly tick: TICK
    readonly tickHooks?: THOOKS
    readonly child?: CHILD
    readonly lock: LCK
  },
>(
  opts: O,
): WorkerRecord<
  TICK,
  THOOKS,
  CHILD,
  LCK,
  SubscriptionLoop<AE, AR>
> => ({
  [WorkerTypeId]: WorkerTypeId,
  name: opts.name,
  loop: { ...SubscriptionLoopTag, acquire: Effect.asVoid(opts.acquire) },
  child: orEmpty(opts.child),
  tick: opts.tick,
  tickHooks: orEmpty(opts.tickHooks),
  lock: opts.lock,
})
