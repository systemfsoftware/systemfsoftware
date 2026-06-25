import { Context, Effect, Exit, Layer, Option, Scope } from 'effect'
import { LeaderLock, LeaderLockInfraError } from './leader-lock.js'
import { LockPrimitiveError } from './lock-primitive.schema.js'

export { LockPrimitiveError } from './lock-primitive.schema.js'

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
