import { expect } from '@effect/vitest'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Cause, Clock, Deferred, Effect, Match, Queue, Ref } from 'effect'
import { fiberMediumLayer } from './__fixtures__/FiberMediumHarness.js'
import { crashingChild, settled, terminatedIn, traceUntil } from './__fixtures__/SupervisorHarness.js'

const Feature = makeFeature({ it })

type Trace = ReadonlyArray<Supervisor.TraceEntry>

const FIRST_INCARNATION = 0

const defectsOf = (cause: Supervisor.SupervisorTerminated['cause']) =>
  Arr.flatMap(cause.reasons, (reason) => Cause.isDieReason(reason) ? [reason.defect] : [])

const recordingChild = (
  childId: string,
  started: Deferred.Deferred<void>,
  stopped: Ref.Ref<ReadonlyArray<string>>,
): Supervisor.FiberProgram =>
  Supervisor.readyOnStart(
    Effect.ensuring(
      Effect.andThen(Deferred.succeed(started, void 0), Effect.never),
      Ref.update(stopped, (seen) => Arr.append(seen, childId)),
    ),
  )

const runningChildIds = (supervisor: Supervisor.RunningSupervisor): Effect.Effect<ReadonlyArray<string>> =>
  Effect.map(Supervisor.statusOf(supervisor), (state) =>
    Match.value(state).pipe(
      Match.tag('Terminated', () => Arr.empty<string>()),
      Match.orElse((running) => Arr.map(running.core.children, (child) => child.childId)),
    ))

const incarnationStarted = (childId: string, generation: number) => (trace: Trace): boolean =>
  Arr.some(trace, (entry) =>
    Match.value(entry.event).pipe(
      Match.tag('ChildStarted', (started) => started.childId === childId && started.generation === generation),
      Match.orElse(() => false),
    ))

const abnormalEnding = (childId: string, generation: number) => (trace: Trace): boolean =>
  Arr.some(trace, (entry) =>
    Match.value(entry.event).pipe(
      Match.tag('ChildTerminated', (terminated) =>
        terminated.childId === childId && terminated.generation === generation &&
        Match.value(terminated.reason).pipe(
          Match.tag('Abnormal', () =>
            true),
          Match.orElse(() => false),
        )),
      Match.orElse(() =>
        false
      ),
    ))

const crashingTree = Effect.gen(function*() {
  const crashes = yield* Queue.unbounded<void>()
  const supervisor = yield* Supervisor.make('root').pipe(
    Supervisor.intensity(0, 5_000),
    Supervisor.children([Supervisor.ChildSpecs.make('crasher', crashingChild(crashes))]),
  ).scoped
  return { crashes, supervisor }
})

const crashingWithKeeper = Effect.gen(function*() {
  const crashes = yield* Queue.unbounded<void>()
  const keeperStarted = yield* Deferred.make<void>()
  const stopped = yield* Ref.make<ReadonlyArray<string>>([])
  const supervisor = yield* Supervisor.make('root').pipe(
    Supervisor.intensity(0, 5_000),
    Supervisor.children([
      Supervisor.ChildSpecs.make('crasher', crashingChild(crashes)),
      Supervisor.ChildSpecs.make('keeper', recordingChild('keeper', keeperStarted, stopped)),
    ]),
  ).scoped
  return { crashes, keeperStarted, stopped, supervisor }
})

Feature('An owner whose supervisor gives up')
  .withLayer(fiberMediumLayer)
  .body(({ scenario }) => {
    scenario(
      'A supervisor that exceeds its intensity fails its owner with the crash that exhausted it',
      Gherkin.Do.pipe(
        Given('a supervisor allows no restarts and runs one child that will crash')(
          'tree',
          () => crashingTree,
        ),
        When('the child crashes')('failure', ({ tree }) =>
          Effect.gen(function*() {
            const before = yield* Clock.currentTimeMillis
            yield* Queue.offer(tree.crashes, void 0)
            const error = yield* Supervisor.awaitTerminated(tree.supervisor).pipe(Effect.flip)
            const after = yield* Clock.currentTimeMillis
            return { before, after, error }
          })),
        Then('the owner sees a typed give-up naming the supervisor and its crash')(({ failure }) => {
          expect(failure.error).toBeInstanceOf(Supervisor.SupervisorTerminated)
          expect(failure.error.name).toBe('root')
          expect(failure.error.cause.pipe(defectsOf)).toContain('crashed')
        }),
        And('the give-up and the failure happen at the same instant')(({ failure }) => {
          expect(failure.after).toEqual(failure.before)
        }),
      ),
    )

    scenario(
      'With intensity zero the supervisor gives up on the first abnormal exit without restarting the child',
      Gherkin.Do.pipe(
        Given('a supervisor allows no restarts and runs one child that will crash')('tree', () => crashingTree),
        When('that child crashes once')(
          'observation',
          ({ tree }) =>
            Effect.gen(function*() {
              const watching = yield* traceUntil(tree.supervisor, terminatedIn)
              yield* Queue.offer(tree.crashes, void 0)
              const trace = yield* settled(watching)
              const failure = yield* Supervisor.awaitTerminated(tree.supervisor).pipe(Effect.flip)
              return { failure, trace }
            }),
        ),
        Then('the owner sees a typed give-up')(({ observation }) => {
          expect(observation.failure).toBeInstanceOf(Supervisor.SupervisorTerminated)
        }),
        And('the child is never started a second time')(({ observation }) => {
          expect(observation.trace).toSatisfy(abnormalEnding('crasher', FIRST_INCARNATION))
          expect(observation.trace).toSatisfy(
            (trace: Trace) => !incarnationStarted('crasher', FIRST_INCARNATION + 1)(trace),
          )
        }),
      ),
    )

    scenario(
      'Every child is stopped before the owner sees the give-up',
      Gherkin.Do.pipe(
        Given('a supervisor allows no restarts and runs a crashing child beside a steady one')(
          'tree',
          () => crashingWithKeeper,
        ),
        When('the crashing child crashes')(
          'observation',
          ({ tree }) =>
            Effect.gen(function*() {
              yield* Deferred.await(tree.keeperStarted)
              yield* Queue.offer(tree.crashes, void 0)
              yield* Supervisor.awaitTerminated(tree.supervisor).pipe(Effect.flip)
              const stopped = yield* Ref.get(tree.stopped)
              const running = yield* runningChildIds(tree.supervisor)
              return { stopped, running }
            }),
        ),
        Then('the steady child has finished stopping by then')(({ observation }) => {
          expect(observation.stopped).toContain('keeper')
        }),
        And('no child is still running')(({ observation }) => {
          expect(observation.running).toEqual([])
        }),
      ),
    )
  })
