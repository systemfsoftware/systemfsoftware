import { Duration, Effect, Match, Option, Predicate, Schedule } from 'effect'
import { type LeaderLockAcquireError, LeaderLockNotAcquired } from './LeaderLock.schema.js'
import type { LeaderLock } from './LeaderLockAdapter.js'

export interface LeaderLockOptions {
  readonly key: string
  readonly mode: 'required' | 'optional'
  readonly acquireRetryBackoff?: Schedule.Schedule<Duration.Duration>
}

/**
 * Runs `self` while holding the named leader lock.
 */
export function withLeaderLock<A, E, R>(
  self: Effect.Effect<A, E, R>,
  options: LeaderLockOptions,
  lock: LeaderLock['Service'],
): Effect.Effect<A | void, E | LeaderLockAcquireError, R> {
  const acquire = Effect.gen(function*() {
    const out = yield* lock.withLock(options.key, self)
    if (Option.isSome(out)) {
      return out.value
    }
    return yield* Match.value(options.mode).pipe(
      Match.when('required', () => Effect.fail(LeaderLockNotAcquired.make({ key: options.key }))),
      Match.when('optional', () => Effect.void),
      Match.exhaustive,
    )
  })
  const retryOnce = (
    current: Schedule.Schedule<Duration.Duration>,
  ): Effect.Effect<A | void, E | LeaderLockAcquireError, R> =>
    Effect.retry(acquire, {
      schedule: current,
      while: Predicate.isTagged('LeaderLockNotAcquired'),
    }).pipe(
      Effect.catchTag('LeaderLockNotAcquired', () => retryOnce(current)),
    )
  const backoff = options.acquireRetryBackoff
  if (options.mode === 'required' && backoff !== null && typeof backoff === 'object') {
    const schedule: Schedule.Schedule<Duration.Duration> = backoff
    return retryOnce(schedule)
  }
  return acquire
}
