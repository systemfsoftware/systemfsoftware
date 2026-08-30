import { Duration, Effect, Option } from 'effect'
import { WorkerTypeId } from './Brands.js'
import type { PollLoop } from './DaemonSpec.schema.js'
import { PollLoopTag } from './LoopTags.js'

type WorkerRecord<TICK, THOOKS, CHILD, LCK, L> = {
  readonly [WorkerTypeId]: WorkerTypeId
  readonly name: string
  readonly loop: L
  readonly child: CHILD | Record<never, never>
  readonly tick: TICK
  readonly tickHooks: THOOKS | Record<never, never>
  readonly lock: LCK
}

type PollShape<W, D, WE, WR> =
  | {
    readonly name: string
    readonly interval: Duration.Input
    readonly work: (data: D) => Effect.Effect<void, WE, WR>
    readonly prereq: Effect.Effect<Option.Option<D>, WE, WR>
  }
  | {
    readonly name: string
    readonly interval: Duration.Input
    readonly work: W
    readonly prereq?: undefined
  }

/** @public */
export const poll = <
  W extends Effect.Effect<unknown, WE, WR>,
  D,
  WE,
  WR,
  TICK,
  THOOKS,
  CHILD,
  LCK,
  O extends PollShape<W, D, WE, WR> & {
    readonly tick: TICK
    readonly tickHooks?: THOOKS
    readonly child?: CHILD
    readonly lock: LCK
  },
>(opts: O): WorkerRecord<TICK, THOOKS, CHILD, LCK, PollLoop<WE, WR>> => {
  if (typeof opts.prereq === 'undefined') {
    const gate = Effect.succeed(Option.some(Effect.asVoid(opts.work)))
    return {
      [WorkerTypeId]: WorkerTypeId,
      name: opts.name,
      loop: { ...PollLoopTag, gate, interval: opts.interval },
      child: opts.child ?? {},
      tick: opts.tick,
      tickHooks: opts.tickHooks ?? {},
      lock: opts.lock,
    }
  }
  const { prereq, work } = opts
  const gate = Effect.map(prereq, Option.map((data) => work(data)))
  return {
    [WorkerTypeId]: WorkerTypeId,
    name: opts.name,
    loop: { ...PollLoopTag, gate, interval: opts.interval },
    child: opts.child ?? {},
    tick: opts.tick,
    tickHooks: opts.tickHooks ?? {},
    lock: opts.lock,
  }
}
