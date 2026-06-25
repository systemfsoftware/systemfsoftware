import { Effect, HashMap, Layer, Option, Ref, Scope } from 'effect'
import { LockPrimitive, LockPrimitiveError } from '../../lock-primitive.js'

export const mkStatefulLockPrimitive: Layer.Layer<LockPrimitive> = Layer.effect(
  LockPrimitive,
  Effect.gen(function*() {
    const held = yield* Ref.make(HashMap.empty<string, Scope.Scope>())
    return LockPrimitive.of({
      tryAcquire: (key) =>
        Effect.gen(function*() {
          const scope = yield* Effect.scope
          const acquired = yield* Ref.modify(held, (map) => {
            const current = HashMap.get(map, key)
            if (Option.isNone(current)) {
              return [true as const, HashMap.set(map, key, scope)]
            }
            if (current.value === scope) {
              return [true as const, map]
            }
            return [false as const, map]
          })
          if (acquired) {
            yield* Effect.addFinalizer(() => Ref.update(held, HashMap.remove(key)))
          }
          return acquired
        }),
    })
  }),
)

export const mkBlockingStatefulLockPrimitive: Layer.Layer<LockPrimitive> = Layer.effect(
  LockPrimitive,
  Effect.gen(function*() {
    const held = yield* Ref.make(HashMap.empty<string, Scope.Scope>())
    return LockPrimitive.of({
      tryAcquire: (key) =>
        Effect.gen(function*() {
          const scope = yield* Effect.scope
          const map = yield* Ref.get(held)
          const current = HashMap.get(map, key)
          if (Option.isNone(current)) {
            yield* Ref.update(held, HashMap.set(key, scope))
            yield* Effect.addFinalizer(() => Ref.update(held, HashMap.remove(key)))
            return true
          }
          if (current.value === scope) {
            return true
          }
          return yield* Effect.never
        }),
    })
  }),
)

export const mkFailingLockPrimitive: Layer.Layer<LockPrimitive> = Layer.succeed(
  LockPrimitive,
  LockPrimitive.of({
    tryAcquire: (key) => Effect.fail(new LockPrimitiveError({ key, cause: 'infrastructure unavailable' })),
  }),
)
