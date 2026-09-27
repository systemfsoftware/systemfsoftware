import { Deferred, Effect, Fiber } from 'effect'

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

/** A child that suspends on a handoff nobody ever completes. */
const waitingChild = (gate: Deferred.Deferred<void>): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* Effect.void
    yield* Deferred.await(gate)
  })

/** A root that leaves a detached child suspended on a handoff nobody ever completes. */
export const rootLeavingDetachedChild: Effect.Effect<ReadonlyArray<string>> = Effect.gen(function*() {
  const gate = yield* Deferred.make<void>()
  yield* Effect.forkDetach(waitingChild(gate), { startImmediately: true })
  return CHILD_NAMES
})

export const rootWithScopedChild: Effect.Effect<void> = Effect.scoped(
  Effect.gen(function*() {
    yield* Effect.forkChild(Effect.as(Effect.sleep('1 hour'), 'alpha'), { startImmediately: true })
    yield* Effect.sleep('1 second')
  }),
)
