import * as Effect from 'effect/Effect'
import * as Ref from 'effect/Ref'

export interface IdGenerator {
  readonly next: Effect.Effect<number>
}

export const makeIdGenerator: Effect.Effect<IdGenerator> = Effect.gen(function*() {
  const ref = yield* Ref.make(0)
  return {
    next: Ref.getAndUpdate(ref, (n) => n + 1),
  }
})
