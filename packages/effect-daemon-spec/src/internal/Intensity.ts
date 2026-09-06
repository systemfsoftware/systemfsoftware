import { Clock, Duration, Effect, Ref } from 'effect'
import { exceedsRestarts, pruneTimestamps, recordTimestamp } from './IntensityWindow.js'

/** @internal */
export interface IntensityTracker {
  readonly record: Effect.Effect<void>
  readonly isExceeded: Effect.Effect<boolean>
  readonly count: Effect.Effect<number>
}

/** @internal */
export const neverExceeds: IntensityTracker = {
  record: Effect.void,
  isExceeded: Effect.succeed(false),
  count: Effect.succeed(0),
}

/** @internal */
export const make = (restarts: number, window: Duration.Duration): Effect.Effect<IntensityTracker> =>
  Effect.gen(function*() {
    const windowMillis = Duration.toMillis(window)
    const timestamps = yield* Ref.make<readonly number[]>([])
    const prune = (now: number): Effect.Effect<readonly number[]> =>
      Ref.modify(timestamps, (ts) => {
        const active = pruneTimestamps(ts, now, windowMillis)
        return [active, active]
      })
    return {
      record: Effect.gen(function*() {
        const now = yield* Clock.currentTimeMillis
        yield* Ref.update(timestamps, (ts) => recordTimestamp(ts, now, windowMillis))
      }),
      isExceeded: Effect.gen(function*() {
        const now = yield* Clock.currentTimeMillis
        const active = yield* prune(now)
        return exceedsRestarts(active.length, restarts)
      }),
      count: Effect.gen(function*() {
        const now = yield* Clock.currentTimeMillis
        const active = yield* prune(now)
        return active.length
      }),
    }
  })
