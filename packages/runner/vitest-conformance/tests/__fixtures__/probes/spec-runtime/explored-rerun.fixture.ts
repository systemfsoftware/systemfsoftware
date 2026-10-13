import { Effect, Fiber, Ref } from 'effect'

export const counted = (scenario: string): Effect.Effect<string> =>
  Effect.sync(() => {
    console.log(`explored-rerun: ${scenario}`)
    return scenario
  })

export const shelvedByTwoClerks: Effect.Effect<number> = Effect.gen(function*() {
  const shelved = yield* Ref.make(0)
  const shelve = Ref.update(shelved, (count) => count + 1)
  const first = yield* Effect.forkChild(shelve)
  const second = yield* Effect.forkChild(shelve)
  yield* Fiber.join(first)
  yield* Fiber.join(second)
  return yield* Ref.get(shelved)
})

const shelfReadings = Ref.makeUnsafe(0)

export const readShelfCounter: Effect.Effect<number> = Ref.getAndUpdate(shelfReadings, (n) => n + 1)
