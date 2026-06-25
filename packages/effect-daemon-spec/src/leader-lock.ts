import { Context, Effect, Layer, Match, Option } from 'effect'
import { dual } from 'effect/Function'
import { type LeaderLockAcquireError, type LeaderLockInfraError, LeaderLockNotAcquired } from './leader-lock.schema.js'

export { type LeaderLockAcquireError, LeaderLockInfraError, LeaderLockNotAcquired } from './leader-lock.schema.js'

export interface LeaderLockService {
  readonly withLock: <A, E, R>(
    key: string,
    self: Effect.Effect<A, E, R>,
  ) => Effect.Effect<Option.Option<A>, E | LeaderLockInfraError, R>
}

export class LeaderLock extends Context.Tag(
  '@systemfsoftware/effect-daemon-spec/leader-lock/LeaderLock',
)<LeaderLock, LeaderLockService>() {
  static readonly Noop: Layer.Layer<LeaderLock> = Layer.succeed(
    LeaderLock,
    LeaderLock.of({
      withLock: (_key, self) => Effect.map(self, Option.some),
    }),
  )
}

export interface LeaderLockOptions {
  readonly key: string
  readonly mode: 'required' | 'optional'
}

export const withLeaderLock: {
  (options: LeaderLockOptions): <A, E, R>(
    self: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A | void, E | LeaderLockAcquireError, R | LeaderLock>
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    options: LeaderLockOptions,
  ): Effect.Effect<A | void, E | LeaderLockAcquireError, R | LeaderLock>
} = dual(
  2,
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    options: LeaderLockOptions,
  ): Effect.Effect<A | void, E | LeaderLockAcquireError, R | LeaderLock> =>
    Effect.gen(function*() {
      const lock = yield* LeaderLock
      const out = yield* lock.withLock(options.key, self)
      if (Option.isSome(out)) {
        return out.value
      }
      return yield* Match.value(options.mode).pipe(
        Match.when('required', () => Effect.fail(new LeaderLockNotAcquired({ key: options.key }))),
        Match.when('optional', () => Effect.void),
        Match.exhaustive,
      )
    }),
)
