import { Deferred, Effect, Exit, Fiber } from 'effect'

/** Records the value a program's cleanup saw, the way a consumer watches it. */
export type Observed = (value: string) => void

/**
 * The minimal race repro: cleanup races a fast send against a slow one, so it
 * must always see the fast one win, on Effect's runtime and under the kernel.
 */
export const raceFinalizerProgram = (observed: Observed): Effect.Effect<void> =>
  Effect.scoped(
    Effect.gen(function*() {
      yield* Effect.addFinalizer(() =>
        Effect.raceFirst(
          Effect.as(Effect.sleep('30 millis'), 'won'),
          Effect.as(Effect.sleep('2 seconds'), 'lost'),
        ).pipe(Effect.flatMap((value) => Effect.sync(() => observed(value))))
      )
      yield* Effect.sleep('1 second')
    }),
  )

/**
 * The minimal timeout repro: cleanup sends under a limit far longer than the
 * send, so the send must complete rather than a lost race resolve it.
 */
export const sendUnderTimeoutProgram = (observed: Observed): Effect.Effect<void> =>
  Effect.scoped(
    Effect.gen(function*() {
      yield* Effect.addFinalizer(() =>
        Effect.timeout(Effect.as(Effect.sleep('500 millis'), 'sent'), '4 seconds').pipe(
          Effect.map((value) => String(value)),
          Effect.flatMap((value) => Effect.sync(() => observed(value))),
          Effect.orDie,
        )
      )
      yield* Effect.sleep('1 second')
    }),
  )

/** Stops a program's own fiber on Effect's runtime while its body sleeps. */
export const interruptOnEffectRuntime = (program: Effect.Effect<void>): Effect.Effect<void> =>
  Effect.gen(function*() {
    const fiber = yield* Effect.forkChild(program, { startImmediately: true })
    yield* Effect.sleep('5 millis')
    yield* Fiber.interrupt(fiber)
  })

/** What Effect's fiber exposes around one suspension. */
export interface YieldedGuard {
  /** True when the resume guard is a callable while the fiber is suspended. */
  readonly suspended: boolean
  /** True when that guard is gone once the fiber resumes. */
  readonly cleared: boolean
}

const hasResumeGuard = (fiber: AnyFiber): boolean => typeof Reflect.get(fiber, '_yielded') === 'function'
const resumeGuardCleared = (fiber: AnyFiber): boolean => Reflect.get(fiber, '_yielded') === undefined

// Effect numbers fibers; this alias keeps the private-field reads nameable.
type AnyFiber<A = unknown, E = unknown> = Fiber.Fiber<A, E>

/**
 * Effect's fiber keeps its resume guard in the private `_yielded` field while it
 * is suspended and clears it on resume. The kernel's suspension fix reads that
 * field, so this pins the field's name and behaviour to the vendored Effect.
 */
export const probeYieldedGuard: Effect.Effect<YieldedGuard> = Effect.gen(function*() {
  const gate = yield* Deferred.make<number>()
  const fiber: AnyFiber<number, never> = yield* Effect.forkChild(Deferred.await(gate), { startImmediately: true })
  const suspended = hasResumeGuard(fiber)
  yield* Deferred.done(gate, Exit.succeed(1))
  yield* Fiber.join(fiber)
  return { suspended, cleared: resumeGuardCleared(fiber) }
})
