import { Context, Effect, Exit, Layer, Option, Scope } from 'effect'
import { LeaderLockInfraError } from './LeaderLock.schema.js'
import { LockPrimitiveError } from './LockPrimitive.schema.js'

/** @public */
export interface LeaderLockService {
  readonly withLock: <A, E, R>(
    key: string,
    self: Effect.Effect<A, E, R>,
  ) => Effect.Effect<Option.Option<A>, E | LeaderLockInfraError, R>
}

/** @public */
export class LeaderLock extends Context.Service<LeaderLock, LeaderLockService>()(
  '@systemfsoftware/effect-daemon-spec/LeaderLockAdapter/LeaderLock',
) {
  static readonly Noop: Layer.Layer<LeaderLock> = Layer.succeed(
    LeaderLock,
    LeaderLock.of({
      withLock: (_key, self) => Effect.map(self, Option.some),
    }),
  )
}

/** @public */
export interface LockPrimitiveService {
  readonly tryAcquire: (
    key: string,
  ) => Effect.Effect<boolean, LockPrimitiveError, Scope.Scope>
}

/** @public */
export class LockPrimitive extends Context.Service<LockPrimitive, LockPrimitiveService>()(
  '@systemfsoftware/effect-daemon-spec/LeaderLockAdapter/LockPrimitive',
) {}

/** @public */
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
              Scope.provide(scope),
              Effect.mapError((cause) => LeaderLockInfraError.make({ key, cause })),
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
