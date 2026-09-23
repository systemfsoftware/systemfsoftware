import { Duration, Effect, Function, Match, Option, Predicate, Schedule } from 'effect'
import { type LeaderLockAcquireError, LeaderLockNotAcquired } from './LeaderLock.schema.js'
import type { LeaderLock } from './LeaderLockAdapter.js'

export interface LeaderLockOptions {
  readonly key: string
  readonly mode: 'required' | 'optional'
  readonly acquireRetryBackoff?: Schedule.Schedule<Duration.Duration>
}

const acquireWithLock = <A, E, R>(
  self: Effect.Effect<A, E, R>,
  options: LeaderLockOptions,
  lock: LeaderLock['Service'],
): Effect.Effect<A | void, E | LeaderLockAcquireError, R> =>
  Effect.gen(function*() {
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

const retryAcquire = <A, E, R>(
  acquire: Effect.Effect<A | void, E | LeaderLockAcquireError, R>,
  current: Schedule.Schedule<Duration.Duration>,
): Effect.Effect<A | void, E | LeaderLockAcquireError, R> =>
  Effect.retry(acquire, {
    schedule: current,
    while: Predicate.isTagged('LeaderLockNotAcquired'),
  }).pipe(
    Effect.catchTag('LeaderLockNotAcquired', () => retryAcquire(acquire, current)),
  )

const withRequiredBackoff = <A, E, R>(
  acquire: Effect.Effect<A | void, E | LeaderLockAcquireError, R>,
  backoff: Schedule.Schedule<Duration.Duration> | undefined,
): Effect.Effect<A | void, E | LeaderLockAcquireError, R> => {
  if (typeof backoff === 'undefined') {
    return acquire
  }
  return retryAcquire(acquire, backoff)
}

/**
 * Runs `self` while holding the named leader lock.
 */
export const withLeaderLock: {
  <A, E, R>(
    options: LeaderLockOptions,
    lock: LeaderLock['Service'],
  ): (self: Effect.Effect<A, E, R>) => Effect.Effect<A | void, E | LeaderLockAcquireError, R>
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    options: LeaderLockOptions,
    lock: LeaderLock['Service'],
  ): Effect.Effect<A | void, E | LeaderLockAcquireError, R>
} = Function.dual(
  3,
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    options: LeaderLockOptions,
    lock: LeaderLock['Service'],
  ): Effect.Effect<A | void, E | LeaderLockAcquireError, R> => {
    const acquire = acquireWithLock(self, options, lock)
    if (options.mode !== 'required') {
      return acquire
    }
    return withRequiredBackoff(acquire, options.acquireRetryBackoff)
  },
)
