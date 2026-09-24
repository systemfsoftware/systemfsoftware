import { it } from '@effect/vitest'
import { Deferred, Duration, Effect, Exit, Fiber, Match, Ref, Result, Scope } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect } from 'vitest'
import type { TerminationReason } from '../kernel/TerminationReport.schema.js'
import * as FiberMedium from '../Supervisor/FiberMedium.js'

/**
 * Start a bare program the way a supervisor's write phase will: normalize it
 * once at the declaration site, fork one child sub-scope, then provide that
 * sub-scope to the medium's `start` (scoped-lifecycle-boundaries.md §4).
 */
const startInChildScope = (program: FiberMedium.BareFiberProgram) =>
  Effect.gen(function*() {
    const parent = yield* Effect.scope
    const childScope = yield* Scope.fork(parent)
    const started = yield* FiberMedium.medium
      .start(FiberMedium.readyOnStart(program))
      .pipe(Scope.provide(childScope))
    return { childScope, started }
  })

const settlesImmediately = (effect: Effect.Effect<void>): Effect.Effect<boolean> =>
  Effect.map(effect.pipe(Effect.timeout('0 millis'), Effect.result), Result.isSuccess)

const causeOf = (reason: TerminationReason): string =>
  Match.value(reason).pipe(
    Match.when({ _tag: 'Abnormal' }, (abnormal) =>
      Match.value(abnormal.report).pipe(
        Match.when({ _tag: 'CauseReport' }, (report) => report.cause),
        Match.orElse(() => ''),
      )),
    Match.orElse(() => ''),
  )
describe('the termination reason a fiber child reports', () => {
  it.effect('Should_ReportNormal_When_TheChildSucceeds', () =>
    Effect.gen(function*() {
      const { started } = yield* startInChildScope(Effect.void)
      expect(yield* FiberMedium.medium.report(started)).toEqual({ _tag: 'Normal' })
    }))

  it.effect('Should_ReportAbnormalCarryingTheCause_When_TheChildDies', () =>
    Effect.gen(function*() {
      const { started } = yield* startInChildScope(Effect.die('boom'))
      const reason = yield* FiberMedium.medium.report(started)
      expect(causeOf(reason)).toContain('boom')
      expect(causeOf(reason) === '').toBe(false)
    }))

  it.effect('Should_ReportShutdown_When_TheChildIsInterrupted', () =>
    Effect.gen(function*() {
      const { started } = yield* startInChildScope(Effect.interrupt)
      expect(yield* FiberMedium.medium.report(started)).toEqual({ _tag: 'Shutdown' })
    }))
})

describe('the readiness a fiber child declares', () => {
  it.effect('Should_WaitForTheChildSignal_When_TheProgramCallsReadiness', () =>
    Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      const parent = yield* Effect.scope
      const childScope = yield* Scope.fork(parent)
      const started = yield* FiberMedium.medium
        .start((ready) =>
          Effect.gen(function*() {
            yield* Deferred.await(gate)
            yield* ready
            return yield* Effect.never
          })
        )
        .pipe(Scope.provide(childScope))
      expect(yield* settlesImmediately(started.ready)).toBe(false)
      yield* Deferred.succeed(gate, void 0)
      yield* started.ready
    }))
  it.effect('Should_BeReadyOnStart_When_ReadyOnStartNormalizesTheProgram', () =>
    Effect.gen(function*() {
      const { started } = yield* startInChildScope(Effect.never)
      yield* Effect.yieldNow
      expect(yield* settlesImmediately(started.ready)).toBe(true)
    }))
})

describe('the owned shutdown a fiber child accepts', () => {
  it.effect('Should_InterruptWithoutWaiting_When_Brutal', () =>
    Effect.gen(function*() {
      const entered = yield* Ref.make(false)
      const slow = yield* Deferred.make<void>()
      const { started } = yield* startInChildScope(
        Effect.never.pipe(Effect.onInterrupt(() => Effect.andThen(Ref.set(entered, true), Deferred.await(slow)))),
      )
      const stopFiber = yield* Effect.forkScoped(FiberMedium.medium.stop(started, { _tag: 'Brutal' }))
      yield* Effect.yieldNow
      expect(yield* Ref.get(entered)).toBe(true)
      yield* Deferred.succeed(slow, void 0)
      yield* Fiber.await(stopFiber)
      expect(yield* FiberMedium.medium.probe(started)).toBe(false)
    }))

  it.effect('Should_GiveUpWaitingAtTheTimeout_When_GracefulOutlivesItsWindow', () =>
    Effect.gen(function*() {
      const { started } = yield* startInChildScope(
        Effect.asVoid(Effect.andThen(Deferred.await(yield* Deferred.make<void>()), Effect.never)),
      )
      const stopFiber = yield* Effect.forkScoped(
        FiberMedium.medium.stop(started, { _tag: 'Graceful', millis: 100 }),
      )
      yield* TestClock.adjust(Duration.millis(100))
      yield* Fiber.await(stopFiber)
      expect(yield* FiberMedium.medium.probe(started)).toBe(false)
    }))

  it.effect('Should_SignalTheChildAtOnce_When_GracefulStopBegins', () =>
    Effect.gen(function*() {
      const entered = yield* Ref.make(false)
      const { started } = yield* startInChildScope(
        Effect.never.pipe(Effect.onInterrupt(() => Ref.set(entered, true))),
      )
      yield* Effect.yieldNow
      yield* FiberMedium.medium.stop(started, { _tag: 'Graceful', millis: 5_000 })
      expect(yield* Ref.get(entered)).toBe(true)
      expect(yield* FiberMedium.medium.probe(started)).toBe(false)
    }))

  it.effect('Should_InterruptAndAwaitTheFinalizer_When_Infinity', () =>
    Effect.gen(function*() {
      const entered = yield* Ref.make(false)
      const slow = yield* Deferred.make<void>()
      const { started } = yield* startInChildScope(
        Effect.never.pipe(Effect.onInterrupt(() => Effect.andThen(Ref.set(entered, true), Deferred.await(slow)))),
      )
      const stopFiber = yield* Effect.forkScoped(FiberMedium.medium.stop(started, { _tag: 'Infinity' }))
      yield* Effect.yieldNow
      expect(yield* Ref.get(entered)).toBe(true)
      expect(stopFiber.pollUnsafe()).toBeUndefined()
      yield* Deferred.succeed(slow, void 0)
      yield* Fiber.await(stopFiber)
      expect(yield* FiberMedium.medium.probe(started)).toBe(false)
    }))

  it.effect('Should_RunTheChildFinalizers_When_TheChildScopeCloses', () =>
    Effect.gen(function*() {
      const finalized = yield* Ref.make(false)
      const born = yield* Deferred.make<void>()
      const { childScope } = yield* startInChildScope(
        Effect.gen(function*() {
          yield* Effect.addFinalizer(() => Ref.set(finalized, true))
          yield* Deferred.succeed(born, void 0)
          return yield* Effect.never
        }),
      )
      yield* Deferred.await(born)
      yield* Scope.close(childScope, Exit.void)
      expect(yield* Ref.get(finalized)).toBe(true)
    }))

  it.effect('Should_FinishTheStop_When_TheCallerIsInterruptedMidStop', () =>
    Effect.gen(function*() {
      const entered = yield* Ref.make(false)
      const { started } = yield* startInChildScope(
        Effect.never.pipe(
          Effect.onInterrupt(() => Effect.andThen(Ref.set(entered, true), Effect.sleep(Duration.millis(1000)))),
        ),
      )
      const stopFiber = yield* Effect.forkScoped(FiberMedium.medium.stop(started, { _tag: 'Brutal' }))
      yield* Effect.yieldNow
      const interrupter = yield* Effect.forkScoped(Fiber.interrupt(stopFiber))
      yield* TestClock.adjust(Duration.millis(1000))
      yield* Fiber.await(stopFiber)
      yield* Fiber.await(interrupter)
      expect(yield* Ref.get(entered)).toBe(true)
      expect(yield* FiberMedium.medium.probe(started)).toBe(false)
    }))
})
