import { Duration, Effect, Fiber, Option, Scope } from 'effect'
import type { LazyArg } from 'effect/Function'

/**
 * Run `self` detached in `scope`, giving up on the result after `deadline`
 * without giving up on the work.
 *
 * `Effect.timeout` interrupts what it wraps, so timing out the work itself
 * cancels it. Here the deadline wraps only the join, and the fibre belongs to
 * `scope` rather than the caller - observing a fibre does not own it. The
 * caller stops waiting; the work runs on until `scope` closes, which is the
 * one thing that interrupts it and runs its finalisers.
 */
export const detachIn = <A, E, R>(
  self: Effect.Effect<A, E, R>,
  scope: Scope.Scope,
  options: {
    readonly deadline: Duration.Input
    readonly onDeadline: LazyArg<A>
  },
): Effect.Effect<A, E, R> =>
  Effect.forkIn(self, scope).pipe(
    Effect.flatMap((fiber) => Fiber.join(fiber)),
    Effect.timeoutOption(options.deadline),
    Effect.map((result) => Option.getOrElse(result, options.onDeadline)),
  )

/** The fallback the deadline laws below hand to `onDeadline`. */
const onGaveUp: LazyArg<string> = () => 'gave-up'

if (import.meta.vitest !== void 0) {
  const { describe, it } = await import('@effect/vitest')
  const { Effect, Exit, Fiber, Ref, Scope } = await import('effect')
  const { FastCheck: fc, TestClock } = await import('effect/testing')

  /**
   * Each case forks a fibre and drives the clock, so these cost far more than a
   * pure predicate: the default 100 runs overruns vitest's timeout once the
   * suite is running files in parallel.
   */
  const budget = { fastCheck: { numRuns: 25 }, timeout: 30_000 }

  const deadlineMs = fc.integer({ min: 1, max: 10_000 })

  const overrunMs = fc.integer({ min: 1, max: 10_000 })

  const deadlineWithUnderrun = deadlineMs.chain((deadline) =>
    fc.tuple(fc.constant(deadline), fc.integer({ min: 0, max: deadline - 1 }))
  )

  const workTaking = (millis: number) =>
    Effect.gen(function*() {
      const done = yield* Ref.make(false)
      const interrupted = yield* Ref.make(false)
      const work = Effect.sleep(millis).pipe(
        Effect.andThen(Ref.set(done, true)),
        Effect.as('finished'),
        Effect.onInterrupt(() => Ref.set(interrupted, true)),
      )
      return { done, interrupted, work }
    })

  const detachedFor = (deadline: number, workMillis: number) =>
    Effect.gen(function*() {
      const scope = yield* Scope.make()
      const { done, interrupted, work } = yield* workTaking(workMillis)
      const caller = yield* Effect.forkChild(
        detachIn(work, scope, { deadline, onDeadline: onGaveUp }),
      )
      return { scope, done, interrupted, caller }
    })

  describe('detachIn', () => {
    it.effect.prop(
      '∀overrun_WorkOutrunningTheDeadline_→CallerGetsTheFallback',
      [deadlineMs, overrunMs],
      ([deadline, overrun]) =>
        Effect.gen(function*() {
          const { caller } = yield* detachedFor(deadline, deadline + overrun)
          yield* TestClock.adjust(deadline)
          return (yield* Fiber.join(caller)) === 'gave-up'
        }),
      budget,
    )

    it.effect.prop(
      '∀overrun_TheDeadlinePassing_→WorkNeitherFinishedNorInterrupted',
      [deadlineMs, overrunMs],
      ([deadline, overrun]) =>
        Effect.gen(function*() {
          const { done, interrupted, caller } = yield* detachedFor(deadline, deadline + overrun)
          yield* TestClock.adjust(deadline)
          yield* Fiber.join(caller)
          return !(yield* Ref.get(done)) && !(yield* Ref.get(interrupted))
        }),
      budget,
    )

    it.effect.prop(
      '∀overrun_AbandonedWorkLeftAlone_→StillCompletes',
      [deadlineMs, overrunMs],
      ([deadline, overrun]) =>
        Effect.gen(function*() {
          const { done, caller } = yield* detachedFor(deadline, deadline + overrun)
          yield* TestClock.adjust(deadline)
          yield* Fiber.join(caller)
          yield* TestClock.adjust(overrun)
          return (yield* Ref.get(done)) === true
        }),
      budget,
    )

    it.effect.prop(
      '∀overrun_ScopeClosingOnAbandonedWork_→InterruptedAndNeverCompletes',
      [deadlineMs, overrunMs],
      ([deadline, overrun]) =>
        Effect.gen(function*() {
          const { scope, done, interrupted, caller } = yield* detachedFor(deadline, deadline + overrun)
          yield* TestClock.adjust(deadline)
          yield* Fiber.join(caller)
          yield* Scope.close(scope, Exit.succeed(undefined))
          yield* TestClock.adjust(overrun)
          return (yield* Ref.get(interrupted)) === true && (yield* Ref.get(done)) === false
        }),
      budget,
    )

    it.effect.prop(
      '∀underrun_WorkBeatingTheDeadline_→CallerGetsTheWorkResult',
      [deadlineWithUnderrun],
      ([[deadline, workMillis]]) =>
        Effect.gen(function*() {
          const { caller } = yield* detachedFor(deadline, workMillis)
          yield* TestClock.adjust(workMillis)
          return (yield* Fiber.join(caller)) === 'finished'
        }),
      budget,
    )
  })
}
