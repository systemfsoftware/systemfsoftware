import { Conformance } from '@systemfsoftware/conformance-spec'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Deferred, Effect, Equal, Fiber, Layer } from 'effect'
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
  const invoked = yield* Deferred.make<void>()
  const worker = yield* Effect.forkChild(
    recording.record(1, tryAcquire(), Effect.andThen(Deferred.succeed(invoked, undefined), Effect.never)),
  )
  yield* Deferred.await(invoked)
  yield* Fiber.interrupt(worker)
  return yield* recording.operations
})

Feature('Proving concurrent callers against a pure model')
  .withLayer(Layer.empty)
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'Both callers hold the lock when acquiring happens in two separate steps',
      Gherkin.Do.pipe(
        Given('a lock whose holder is checked in one step and set in a later step')(
          'lock',
          () => Effect.succeed(twoStepLock),
        ),
        When('the check runs two callers through every order their calls to acquire can interleave')(
          'checked',
          (s) => lockCheck(s.lock),
        ),
        Then('the history is rejected because no sequential order explains it')((s) => {
          expect(failReportOf(s.checked).failure.judgement.problem).toBe('no-sequential-order')
        }),
        And('the failing schedule shrinks to a single departure from the ordinary order')((s) => {
          expect(failReportOf(s.checked).failure.deviations).toBe(1)
        }),
        And('both callers observed the lock as free at the same moment')((s) => {
          const holders = failReportOf(s.checked).failure.operations.filter(
            (operation) => operation.response === true,
          )
          expect(holders.length).toBe(2)
          expect(new Set(holders.map((operation) => operation.worker)).size).toBe(2)
        }),
      ),
    )

    scenario(
      'The rejected history is reported with the shrunk schedule and what each caller observed',
      Gherkin.Do.pipe(
        Given('a lock whose holder is checked in one step and set in a later step')(
          'lock',
          () => Effect.succeed(twoStepLock),
        ),
        When('the check runs two callers through every order their calls to acquire can interleave')(
          'checked',
          (s) => lockCheck(s.lock),
        ),
        Then("the report spells out the shrunk schedule and both callers' observations")((s) => {
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
      'A correct lock keeps every interleaving in step with the model',
      Gherkin.Do.pipe(
        Given('a lock whose holder is checked and set in a single atomic step')(
          'lock',
          () => Effect.succeed(atomicLock),
        ),
        When('the check runs two callers through every order their calls to acquire can interleave')(
          'checked',
          (s) => lockCheck(s.lock),
        ),
        Then('every interleaving is explained by some sequential order of the model')((s) => {
          expect(passReportOf(s.checked).histories).toBeGreaterThan(1)
        }),
      ),
    )

    scenarioOutline(
      'A finished answer never contradicts a later caller, and overlapping calls commute: <case>',
      [
        {
          case: 'the second caller also saw the lock as free after the first had taken it',
          history: contradictingHistory,
          expectedOrder: undefined,
        },
        {
          case: 'two callers overlapped and one of them took the lock',
          history: commutingHistory,
          expectedOrder: [0, 1],
        },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('a recorded history of two callers asking the same lock for its holder')(
            'history',
            () => Effect.succeed(row.history),
          ),
          When('the model lines the recorded calls up into a sequential order')(
            'explained',
            (s) => Effect.sync(() => Conformance.order(lockModel, s.history)),
          ),
          Then('the calls are explained by the order the callers finished in, or not at all')((s) => {
            expect(s.explained).toEqual(row.expectedOrder)
          }),
        ),
    )

    scenario(
      'A model pinned to a single object for its whole life is refused before anything runs',
      Gherkin.Do.pipe(
        Given('a correct lock and a model whose state is the very same object every time it is read')(
          'subject',
          () => Effect.succeed({ lock: atomicLock, model: pinnedModel }),
        ),
        When('the check is started')('refused', (s) => Effect.flip(lockCheck(s.subject.lock, s.subject.model))),
        Then('the refusal names the state itself as the problem')((s) => {
          expect(s.refused.problem).toBe('state-not-structural')
        }),
        And('the refusal explains that the state must compare by structure')((s) => {
          expect(s.refused.detail).toContain('compare by structure')
        }),
      ),
    )

    scenario(
      'A caller interrupted mid-command leaves every earlier recorded step in place',
      Gherkin.Do.pipe(
        Given('a caller that asks for the lock twice, its second call never answering')(
          'program',
          () => Effect.succeed(recordedWithInterruption),
        ),
        When('the caller is interrupted while its second call is still running')(
          'recording',
          (s) => Effect.promise(() => Kernel.run(s.program)),
        ),
        Then('the finished call keeps its answer in the history')((s) => {
          const operations = operationsOfRun(s.recording)
          expect(operations[0]?.worker).toBe(0)
          expect(operations[0]?.response).toBe(true)
        }),
        And('the interrupted call keeps its invocation without an answer')((s) => {
          const operations = operationsOfRun(s.recording)
          expect(operations[1]?.worker).toBe(1)
          expect(operations[1]?.answered).toBeUndefined()
        }),
      ),
    )
  })
