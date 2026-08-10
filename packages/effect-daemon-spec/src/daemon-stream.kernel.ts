import { WorkerTypeId } from './daemon-spec/brands.kernel.js'

type WorkerRecord<TICK, THOOKS, CHILD, LCK, L> = {
  readonly [WorkerTypeId]: WorkerTypeId
  readonly name: string
  readonly loop: L
  readonly child: CHILD | Record<never, never>
  readonly tick: TICK
  readonly tickHooks: THOOKS | Record<never, never>
  readonly lock: LCK
}

export const streamKernel = <
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
>(opts: O): WorkerRecord<TICK, THOOKS, CHILD, LCK, { readonly _tag: 'Stream'; readonly stream: S }> => ({
  [WorkerTypeId]: WorkerTypeId,
  name: opts.name,
  loop: { _tag: 'Stream' as const, stream: opts.stream },
  child: opts.child ?? {},
  tick: opts.tick,
  tickHooks: opts.tickHooks ?? {},
  lock: opts.lock,
})
