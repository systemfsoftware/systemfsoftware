import { Effect, Fiber } from 'effect'

export const CHILD_NAMES: ReadonlyArray<string> = ['alpha', 'beta', 'gamma']

export const briefWork: Effect.Effect<void> = Effect.andThen(Effect.void, Effect.void)

export const longWork: Effect.Effect<void> = Effect.forEach(Array.from({ length: 200 }), () => Effect.void, {
  discard: true,
})

export const childrenStartedStraightAway = (work: Effect.Effect<void>): Effect.Effect<ReadonlyArray<string>> =>
  Effect.flatMap(
    Effect.forEach(CHILD_NAMES, (name) => Effect.forkChild(Effect.as(work, name), { startImmediately: true }), {
      concurrency: 'unbounded',
    }),
    (children) => Effect.forEach(children, Fiber.join),
  )
