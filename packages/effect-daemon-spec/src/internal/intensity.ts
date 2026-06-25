import { Clock, Duration, Effect, Match, Ref } from 'effect'
import type { Intensity } from '../daemon-policy.schema.js'
import { exceedsRestarts, pruneTimestamps, recordTimestamp } from './intensity-window.js'

export interface IntensityTracker {
  readonly record: Effect.Effect<void>
  readonly isExceeded: Effect.Effect<boolean>
  readonly count: Effect.Effect<number>
}

const neverExceeds: IntensityTracker = {
  record: Effect.void,
  isExceeded: Effect.succeed(false),
  count: Effect.succeed(0),
}

const boundedTracker = (restarts: number, window: Duration.Duration): Effect.Effect<IntensityTracker> =>
  Effect.gen(function*() {
    const windowMillis = Duration.toMillis(window)
    const timestamps = yield* Ref.make<ReadonlyArray<number>>([])
    const prune = (now: number): Effect.Effect<ReadonlyArray<number>> =>
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

export const make = (intensity: Intensity): Effect.Effect<IntensityTracker> =>
  Match.value(intensity).pipe(
    Match.tag('Unbounded', () => Effect.succeed(neverExceeds)),
    Match.tag('Bounded', ({ restarts, window }) => boundedTracker(restarts, window)),
    Match.exhaustive,
  )
