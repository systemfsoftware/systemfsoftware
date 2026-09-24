import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Deferred, Effect, Equal, Exit, Fiber, Layer, Schema } from 'effect'
import { answeredOperation, failReportOf, operationsOfRun } from './__fixtures__/checkReports.js'
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

/** The calls the report shows, laid out per caller the way the check drew them. */
const assignmentOfHistory = (
  operations: ReadonlyArray<LockOperation>,
): ReadonlyArray<ReadonlyArray<LockCommand>> => {
  const byWorker = new Map<number, Array<LockCommand>>()
  operations.forEach((operation) => {
    const mine = byWorker.get(operation.worker) ?? []
    mine.push(operation.command)
    byWorker.set(operation.worker, mine)
  })
  return [...byWorker.keys()]
    .sort((left, right) => left - right)
    .map((worker) => byWorker.get(worker) ?? [])
}

const recordedOver = (
  assignments: ReadonlyArray<ReadonlyArray<LockCommand>>,
): Effect.Effect<ReadonlyArray<LockOperation>, never, Locks> =>
  Effect.gen(function*() {
    const recording = yield* Conformance.recording<LockCommand, boolean | void>()
    const workers = yield* Effect.forEach(
      assignments,
      (commands, worker) =>
        Effect.forkChild(
          Effect.forEach(
            commands,
            (command) => recording.record(worker, command, runLockCommand(command)),
            { concurrency: 1 },
          ).pipe(Effect.asVoid),
        ),
    )
    yield* Effect.forEach(workers, (worker) => Fiber.join(worker), { concurrency: 1 })
    return yield* recording.operations
  })

const unexplained = (result: Kernel.RunResult<ReadonlyArray<LockOperation>, never>): boolean =>
  !('exit' in result) || Exit.isFailure(result.exit) || Conformance.order(lockModel, result.exit.value) === undefined

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

Feature('Proving concurrent callers against a pure model', { timeout: 0 })
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
        Then('the history is rejected with one deviation, both callers having seen the lock as free')((s, expect) => {
          const holders = failReportOf(s.checked).failure.operations.filter((operation) => operation.response === true)
          return expect({
            report: s.checked,
            holders: holders.length,
            distinctHolders: new Set(holders.map((operation) => operation.worker)).size,
          }).toMatchObject({
            report: {
              _tag: 'Fail',
              failure: { judgement: { problem: 'no-sequential-order' }, deviations: 1 },
            },
            holders: 2,
            distinctHolders: 2,
          })
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
        Then("the report spells out the shrunk schedule and both callers' observations")((s, expect) =>
          expect({
            report: s.checked,
            rendered: Conformance.render(s.checked),
          }).toMatchObject({
            report: { _tag: 'Fail', failure: { judgement: { problem: 'no-sequential-order' } } },
            rendered: expect.stringMatching(
              /no sequential order explains this history[\s\S]*deviation[\s\S]*fiber 0[\s\S]*fiber 1[\s\S]*true/,
            ),
          })
        ),
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
        Then('every interleaving is explained by some sequential order of the model')((s, expect) =>
          expect(s.checked).toMatchObject({
            _tag: 'Pass',
            histories: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(1)))),
          })
        ),
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
          Then('the calls are explained by the order the callers finished in, or not at all')((s, expect) =>
            expect(s.explained).toEqual(row.expectedOrder)
          ),
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
        Then('the refusal names the state itself as the problem and asks the model to compare by structure')(
          (s, expect) =>
            expect(s.refused).toMatchObject({
              _tag: 'ModelError',
              problem: 'state-not-structural',
              detail: expect.stringContaining('compare by structure'),
            }),
        ),
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
        Then('the finished call keeps its answer and the interrupted call keeps its invocation without an answer')(
          (s, expect) =>
            expect(operationsOfRun(s.recording)).toMatchObject([
              expect.objectContaining({ worker: 0, response: true }),
              expect.objectContaining({ worker: 1, answered: undefined }),
            ]),
        ),
      ),
    )

    scenario(
      'The rejected history is reported with the effort spent exploring it after shrinking',
      Gherkin.Do.pipe(
        Given('a lock whose holder is checked in one step and set in a later step')(
          'lock',
          () => Effect.succeed(twoStepLock),
        ),
        When('the check runs two callers through every order their calls to acquire can interleave')(
          'checked',
          (s) => lockCheck(s.lock),
        ),
        Then('the report names the calls both callers saw and the effort a fresh exploration of them takes')(
          (s, expect) => {
            const operations = failReportOf(s.checked).failure.operations
            return Effect.map(
              Effect.promise(() =>
                Kernel.search(
                  Effect.provide(recordedOver(assignmentOfHistory(operations)), s.lock),
                  { isFailure: unexplained },
                )
              ),
              (fresh) =>
                expect({ report: s.checked, operationCount: operations.length }).toMatchObject({
                  report: {
                    _tag: 'Fail',
                    failure: {
                      judgement: { problem: 'no-sequential-order' },
                      bound: fresh.bound,
                    },
                  },
                  operationCount: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
                }),
            )
          },
        ),
      ),
    )
  })
