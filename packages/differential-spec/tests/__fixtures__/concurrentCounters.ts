import { Effect, Fiber, Ref } from 'effect'

type Bump = (counter: Ref.Ref<number>) => Effect.Effect<void>

const bumpTwice = (start: number, bump: Bump): Effect.Effect<number> =>
  Effect.gen(function*() {
    const counter = yield* Ref.make(start)
    const first = yield* Effect.forkChild(bump(counter))
    const second = yield* Effect.forkChild(bump(counter))
    yield* Fiber.join(first)
    yield* Fiber.join(second)
    return yield* Ref.get(counter)
  })

const bumpTwiceInOneWorker = (start: number, bump: Bump): Effect.Effect<number> =>
  Effect.gen(function*() {
    const counter = yield* Ref.make(start)
    yield* bump(counter)
    yield* bump(counter)
    return yield* Ref.get(counter)
  })

const bumpInOneStep: Bump = (counter) => Ref.update(counter, (count) => count + 1)

const bumpWithModify: Bump = (counter) => Ref.modify(counter, (count) => [void 0, count + 1]).pipe(Effect.asVoid)

const bumpInTwoSteps: Bump = (counter) =>
  Effect.gen(function*() {
    const seen = yield* Ref.get(counter)
    yield* Ref.set(counter, seen + 1)
  })

export const sequentialBumps = (start: number): Effect.Effect<number> => bumpTwiceInOneWorker(start, bumpInTwoSteps)

export const atomicBumps = (start: number): Effect.Effect<number> => bumpTwice(start, bumpInOneStep)

export const atomicBumpsByModify = (start: number): Effect.Effect<number> => bumpTwice(start, bumpWithModify)

export const splitWorkerBumps = (start: number): Effect.Effect<number> => bumpTwice(start, bumpInTwoSteps)
