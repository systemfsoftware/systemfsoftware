import { Context, Duration, Effect, Match, Option, Predicate, Schedule } from 'effect'
import type { LeaderLock } from '../leader-lock.adapter.js'
import { type LeaderLockAcquireError, LeaderLockNotAcquired } from '../leader-lock.schema.js'

export interface LeaderLockOptions {
  readonly key: string
  readonly mode: 'required' | 'optional'
  readonly acquireRetryBackoff?: Schedule.Schedule<Duration.Duration>
}

export class WithLeaderLockExecutorDeps extends Context.Tag(
  'WithLeaderLockExecutorDeps',
)<WithLeaderLockExecutorDeps, { readonly withLock: LeaderLock['Type']['withLock'] }>() {}

export function withLeaderLock<A, E, R>(
  self: Effect.Effect<A, E, R>,
  options: LeaderLockOptions,
): Effect.Effect<A | void, E | LeaderLockAcquireError, R | WithLeaderLockExecutorDeps> {
  const acquire = Effect.gen(function*() {
    const lock = yield* WithLeaderLockExecutorDeps
    const out = yield* lock.withLock(options.key, self)
    if (Option.isSome(out)) {
      return out.value
    }
    return yield* Match.value(options.mode).pipe(
      Match.when('required', () => Effect.fail(new LeaderLockNotAcquired({ key: options.key }))),
      Match.when('optional', () => Effect.void),
      Match.exhaustive,
    )
  })
  const retryOnce = (
    current: Schedule.Schedule<Duration.Duration>,
  ): Effect.Effect<A | void, E | LeaderLockAcquireError, R | WithLeaderLockExecutorDeps> =>
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
