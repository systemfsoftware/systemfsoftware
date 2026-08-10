import { describe, it } from '@effect/vitest'
import { Effect, Exit, FastCheck as fc, Fiber, Ref, Scope, TestClock } from 'effect'
import { detachIn } from '../deadline.policy.js'

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
      Effect.zipRight(Ref.set(done, true)),
      Effect.as('finished'),
      Effect.onInterrupt(() => Ref.set(interrupted, true)),
    )
    return { done, interrupted, work }
  })

const detachedFor = (deadline: number, workMillis: number) =>
  Effect.gen(function*() {
    const scope = yield* Scope.make()
    const { done, interrupted, work } = yield* workTaking(workMillis)
    const caller = yield* Effect.fork(
      detachIn(work, scope, { deadline, onDeadline: () => 'gave-up' }),
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
        yield* Scope.close(scope, Exit.void)
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
