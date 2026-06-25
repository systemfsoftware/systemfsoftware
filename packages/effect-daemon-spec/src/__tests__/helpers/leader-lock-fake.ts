import { Effect, HashSet, Layer, Match, Option, Ref } from 'effect'
import { LeaderLock } from '../../leader-lock.js'

export const LeaderLockFake: Layer.Layer<LeaderLock> = Layer.effect(
  LeaderLock,
  Effect.gen(function*() {
    const heldKeys = yield* Ref.make<HashSet.HashSet<string>>(HashSet.empty())
    return LeaderLock.of({
      withLock: (key, self) =>
        Effect.gen(function*() {
          const entered = yield* Ref.modify(heldKeys, (keys) =>
            Match.value(HashSet.has(keys, key)).pipe(
              Match.when(true, () => [false, keys] as const),
              Match.when(false, () => [true, HashSet.add(keys, key)] as const),
              Match.exhaustive,
            ))
          if (!entered) return Option.none()
          const result = yield* Effect.ensuring(
            self,
            Ref.update(heldKeys, (keys) => HashSet.remove(keys, key)),
          )
          return Option.some(result)
        }),
    })
  }),
)
