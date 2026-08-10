import { Duration, Effect, Option } from 'effect'
import { WorkerTypeId } from './brands.kernel.js'

type WorkerRecord<TICK, THOOKS, CHILD, LCK, L> = {
  readonly [WorkerTypeId]: WorkerTypeId
  readonly name: string
  readonly loop: L
  readonly child: CHILD | Record<never, never>
  readonly tick: TICK
  readonly tickHooks: THOOKS | Record<never, never>
  readonly lock: LCK
}

type PollLoopResult<WE, WR> = {
  readonly _tag: 'Poll'
  readonly gate: Effect.Effect<Option.Option<Effect.Effect<void, WE, WR>>, WE, WR>
  readonly interval: Duration.DurationInput
}
type PollShape<W, D, WE, WR> =
  | {
    readonly name: string
    readonly interval: Duration.DurationInput
    readonly work: (data: D) => Effect.Effect<void, WE, WR>
    readonly prereq: Effect.Effect<Option.Option<D>, WE, WR>
  }
  | {
    readonly name: string
    readonly interval: Duration.DurationInput
    readonly work: W
    readonly prereq?: undefined
  }

export const pollKernel = <
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
>(opts: O): WorkerRecord<TICK, THOOKS, CHILD, LCK, PollLoopResult<WE, WR>> => {
  if (typeof opts.prereq === 'undefined') {
    const gate = Effect.succeed(Option.some(Effect.asVoid(opts.work)))
    return {
      [WorkerTypeId]: WorkerTypeId,
      name: opts.name,
      loop: { _tag: 'Poll' as const, gate, interval: opts.interval },
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
    loop: { _tag: 'Poll' as const, gate, interval: opts.interval },
    child: opts.child ?? {},
    tick: opts.tick,
    tickHooks: opts.tickHooks ?? {},
    lock: opts.lock,
  }
}
