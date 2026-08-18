import { Effect } from 'effect'
import { WorkerTypeId } from './Brands.js'

type WorkerRecord<TICK, THOOKS, CHILD, LCK, L> = {
  readonly [WorkerTypeId]: WorkerTypeId
  readonly name: string
  readonly loop: L
  readonly child: CHILD | Record<never, never>
  readonly tick: TICK
  readonly tickHooks: THOOKS | Record<never, never>
  readonly lock: LCK
}

export const subscription = <
  AE,
  AR,
  ACQ extends Effect.Effect<unknown, AE, AR>,
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
  { readonly _tag: 'Subscription'; readonly acquire: Effect.Effect<void, AE, AR> }
> => ({
  [WorkerTypeId]: WorkerTypeId,
  name: opts.name,
  loop: { _tag: 'Subscription' as const, acquire: Effect.asVoid(opts.acquire) },
  child: opts.child ?? {},
  tick: opts.tick,
  tickHooks: opts.tickHooks ?? {},
  lock: opts.lock,
})
