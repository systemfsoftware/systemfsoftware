import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'

export interface IdGeneratorShape {
  readonly next: Effect.Effect<number>
}

export class IdGenerator extends Context.Service<IdGenerator, IdGeneratorShape>()(
  '@systemfsoftware/stryker-js-mutation-run/IdGenerator',
) {}

export const makeIdGenerator: Effect.Effect<IdGeneratorShape> = Effect.gen(function*() {
  const ref = yield* Ref.make(0)
  return {
    next: Ref.getAndUpdate(ref, (n) => n + 1),
  }
})

export const layer = Layer.effect(IdGenerator)(makeIdGenerator)
