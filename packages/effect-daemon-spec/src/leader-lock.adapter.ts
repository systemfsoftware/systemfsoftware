import { Context, Effect, Exit, Layer, Option, Scope } from 'effect'
import { LeaderLockInfraError } from './leader-lock.schema.js'
import { LockPrimitiveError } from './lock-primitive.schema.js'

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

export interface LockPrimitiveService {
  readonly tryAcquire: (
    key: string,
  ) => Effect.Effect<boolean, LockPrimitiveError, Scope.Scope>
}

export class LockPrimitive extends Context.Tag('@systemfsoftware/effect-daemon-spec/lock-primitive/LockPrimitive')<
  LockPrimitive,
  LockPrimitiveService
>() {}

export const LeaderLockFromPrimitive: Layer.Layer<LeaderLock, never, LockPrimitive> = Layer.effect(
  LeaderLock,
  Effect.gen(function*() {
    const primitive = yield* LockPrimitive

    return LeaderLock.of({
      withLock: (key, self) =>
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function*() {
            const scope = yield* Scope.make()
            const acquired = yield* restore(primitive.tryAcquire(key)).pipe(
              Scope.extend(scope),
              Effect.mapError((cause) => new LeaderLockInfraError({ key, cause })),
              Effect.onError(() => Scope.close(scope, Exit.void)),
            )
            if (!acquired) {
              yield* Scope.close(scope, Exit.void)
              return Option.none()
            }
            const result = yield* restore(self).pipe(
              Effect.ensuring(Scope.close(scope, Exit.void)),
            )
            return Option.some(result)
          })
        ),
    })
  }),
)
