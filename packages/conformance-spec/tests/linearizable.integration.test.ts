import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect, Equal, Fiber, Layer } from 'effect'
import { expect } from 'vitest'
import { answeredOperation, failReportOf, operationsOfRun, passReportOf } from './__fixtures__/checkReports.js'
import type { LockOperation } from './__fixtures__/checkReports.js'
import { LockCommand, lockModel, LockState, stepLock, tryAcquire } from './__fixtures__/lock.model.js'
import type { LockState as LockStateValue } from './__fixtures__/lock.model.js'
import { atomicLock, Locks, runLockCommand, twoStepLock } from './__fixtures__/Locks.js'

const Feature = makeFeature({ it })

const lockCheck = (implementation: Layer.Layer<Locks>, model = lockModel) =>
  Conformance.linearizable(implementation, {
    commands: LockCommand,
    model,
    run: runLockCommand,
    fibers: 2,
    operations: 2,
  })

const contradictingHistory: ReadonlyArray<LockOperation> = [
  answeredOperation({ worker: 0, command: tryAcquire(), response: true, invoked: 1, answered: 2 }),
  answeredOperation({ worker: 1, command: tryAcquire(), response: true, invoked: 3, answered: 4 }),
]

const commutingHistory: ReadonlyArray<LockOperation> = [
  answeredOperation({ worker: 0, command: tryAcquire(), response: true, invoked: 1, answered: 3 }),
  answeredOperation({ worker: 1, command: tryAcquire(), response: false, invoked: 2, answered: 4 }),
]

const pinnedState: LockStateValue = Equal.byReferenceUnsafe<LockStateValue>({ holder: undefined })

const pinnedModel = {
  state: LockState,
  initial: pinnedState,
  step: stepLock,
}

const recordedWithInterruption = Effect.gen(function*() {
  const recording = yield* Conformance.recording<LockCommand, boolean | void>()
  yield* recording.record(0, tryAcquire(), Effect.succeed(true))
  const worker = yield* Effect.forkChild(recording.record(1, tryAcquire(), Effect.never))
  yield* Effect.yieldNow
  yield* Fiber.interrupt(worker)
  return yield* recording.operations
})

Feature('Proving concurrent callers against a pure model')
  .withLayer(Layer.empty)
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'Both callers hold the lock when acquiring happens in two separate steps',
      Gherkin.Do.pipe(
        Given('a lock whose holder is checked in one step and set in a later step')(
          'checked',
          () => lockCheck(twoStepLock),
        ),
        Then('the history is rejected because no sequential order explains it')((s) => {
          expect(failReportOf(s.checked).failure.judgement.problem).toBe('no-sequential-order')
        }),
        Then('the failing schedule shrinks to a single departure from the ordinary order')((s) => {
          expect(failReportOf(s.checked).failure.deviations).toBe(1)
        }),
        Then('both callers observed the lock as free at the same moment')((s) => {
          const holders = failReportOf(s.checked).failure.operations.filter(
            (operation) => operation.response === true,
          )
          expect(holders.length).toBe(2)
          expect(new Set(holders.map((operation) => operation.worker)).size).toBe(2)
        }),
        Then('the report names the shrunk schedule and what each caller observed')((s) => {
          const text = Conformance.render(s.checked)
          expect(text).toContain('no sequential order explains this history')
          expect(text).toContain('deviation')
          expect(text).toContain('fiber 0')
          expect(text).toContain('fiber 1')
          expect(text).toContain('true')
        }),
      ),
    )

    scenario(
      'A correct lock keeps every generated schedule in step with the model',
      Gherkin.Do.pipe(
        Given('a lock whose holder is checked and set in a single atomic step')(
          'checked',
          () => lockCheck(atomicLock),
        ),
        Then('every explored schedule matches some sequential order of the model')((s) => {
          expect(passReportOf(s.checked).histories).toBeGreaterThan(1)
        }),
      ),
    )

    scenario(
      'A finished answer may not contradict a later caller, while overlapping callers may commute',
      Gherkin.Do.pipe(
        Given('a history where the second caller also observed the lock as free after the first kept it')(
          'contradicting',
          () => Effect.succeed(Conformance.order(lockModel, contradictingHistory)),
        ),
        Given('a history where two callers overlapped and the lock stayed with one of them')(
          'commuting',
          () => Effect.succeed(Conformance.order(lockModel, commutingHistory)),
        ),
        Then('no sequential order explains the contradicting history')((s) => {
          expect(s.contradicting).toBeUndefined()
        }),
        Then('the overlapping history is explained by the caller who finished first')((s) => {
          expect(s.commuting).toEqual([0, 1])
        }),
      ),
    )

    scenario(
      'A model pinned to a single object for its whole life is refused before anything runs',
      Gherkin.Do.pipe(
        Given('a model whose state is the very same object every time it is read')(
          'refused',
          () => Effect.flip(lockCheck(atomicLock, pinnedModel)),
        ),
        Then('the refusal names the state itself as the problem')((s) => {
          expect(s.refused.problem).toBe('state-not-structural')
        }),
        Then('the refusal explains that the state must compare by structure')((s) => {
          expect(s.refused.detail).toContain('compare by structure')
        }),
      ),
    )

    scenario(
      'A caller interrupted mid-command leaves every earlier recorded step in place',
      Gherkin.Do.pipe(
        Given('a caller whose second command never answers while the first one finished')(
          'recording',
          () => Effect.promise(() => Kernel.run(recordedWithInterruption)),
        ),
        Then('the finished command keeps its answer in the history')((s) => {
          const operations = operationsOfRun(s.recording)
          expect(operations[0]?.worker).toBe(0)
          expect(operations[0]?.response).toBe(true)
        }),
        Then('the interrupted command keeps its invocation without an answer')((s) => {
          const operations = operationsOfRun(s.recording)
          expect(operations[1]?.worker).toBe(1)
          expect(operations[1]?.answered).toBeUndefined()
        }),
      ),
    )
  })
