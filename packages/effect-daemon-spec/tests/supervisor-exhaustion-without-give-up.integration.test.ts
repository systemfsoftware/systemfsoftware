import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from '@systemfsoftware/vitest'
import { Array as Arr, Deferred, Effect, Match, Queue, Ref } from 'effect'
import { fiberMediumLayer } from './__fixtures__/FiberMediumHarness.js'
import { crashingChild, neverChild, settled, terminatedIn, traceUntil } from './__fixtures__/SupervisorHarness.js'

const Feature = makeFeature({ it })

type Trace = ReadonlyArray<Supervisor.TraceEntry>

const FIRST_INCARNATION = 0

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

const finishingChild = (done: Queue.Queue<void>): Supervisor.FiberProgram =>
  Supervisor.readyOnStart(Effect.andThen(Queue.take(done), Effect.void))

const phaseOf = (supervisor: Supervisor.RunningSupervisor): Effect.Effect<string> =>
  Effect.map(Supervisor.statusOf(supervisor), (state) =>
    Match.value(state).pipe(
      Match.tag('Terminated', () => 'terminated'),
      Match.orElse(() => 'running'),
    ))

const incarnationStarted = (childId: string, generation: number) => (trace: Trace): boolean =>
  Arr.some(trace, (entry) =>
    Match.value(entry.event).pipe(
      Match.tag('ChildStarted', (started) => started.childId === childId && started.generation === generation),
      Match.orElse(() => false),
    ))

const temporaryCrashTree = Effect.gen(function*() {
  const crashes = yield* Queue.unbounded<void>()
  const supervisor = yield* Supervisor.make('root').pipe(
    Supervisor.intensity(0, 5_000),
    Supervisor.children([
      Supervisor.ChildSpecs.make('temp', crashingChild(crashes), { restartType: 'temporary' }),
    ]),
  ).scoped
  return { crashes, supervisor }
})

const transientFinishTree = Effect.gen(function*() {
  const done = yield* Queue.unbounded<void>()
  const supervisor = yield* Supervisor.make('root').pipe(
    Supervisor.intensity(0, 5_000),
    Supervisor.children([
      Supervisor.ChildSpecs.make('done', finishingChild(done), { restartType: 'transient' }),
    ]),
  ).scoped
  return { done, supervisor }
})

const oneForAllTree = Effect.gen(function*() {
  const crashes = yield* Queue.unbounded<void>()
  const secondStarted = yield* Deferred.make<void>()
  const thirdStarted = yield* Deferred.make<void>()
  const stopped = yield* Ref.make<ReadonlyArray<string>>([])
  const supervisor = yield* Supervisor.make('fan').pipe(
    Supervisor.strategy('one_for_all'),
    Supervisor.intensity(0, 5_000),
    Supervisor.children([
      Supervisor.ChildSpecs.make('a', crashingChild(crashes)),
      Supervisor.ChildSpecs.make('b', recordingChild('b', secondStarted, stopped)),
      Supervisor.ChildSpecs.make('c', recordingChild('c', thirdStarted, stopped)),
    ]),
  ).scoped
  return { crashes, secondStarted, thirdStarted, stopped, supervisor }
})

const restForOneTree = Effect.gen(function*() {
  const crashes = yield* Queue.unbounded<void>()
  const earlierStarted = yield* Deferred.make<void>()
  const stopped = yield* Ref.make<ReadonlyArray<string>>([])
  const supervisor = yield* Supervisor.make('lattice').pipe(
    Supervisor.strategy('rest_for_one'),
    Supervisor.intensity(0, 5_000),
    Supervisor.children([
      Supervisor.ChildSpecs.make('earlier', recordingChild('earlier', earlierStarted, stopped)),
      Supervisor.ChildSpecs.make('crasher', crashingChild(crashes)),
    ]),
  ).scoped
  return { crashes, earlierStarted, stopped, supervisor }
})

const coolDownTree = Effect.gen(function*() {
  const crashes = yield* Queue.unbounded<void>()
  const supervisor = yield* Supervisor.make('root').pipe(
    Supervisor.intensity(0, 5_000),
    Supervisor.coolDown(1_000),
    Supervisor.children([Supervisor.ChildSpecs.make('crasher', crashingChild(crashes))]),
  ).scoped
  return { crashes, supervisor }
})

const stoppedTree = Effect.gen(function*() {
  const supervisor = yield* Supervisor.make('root').pipe(
    Supervisor.children([Supervisor.ChildSpecs.make('worker', neverChild)]),
  ).scoped
  return { supervisor }
})

Feature('A supervisor whose exhaustion does not end it')
  .withLayer(fiberMediumLayer)
  .body(({ scenario }) => {
    scenario(
      'A temporary child that crashes never gives up the supervisor',
      Gherkin.Do.pipe(
        Given('a supervisor allows no restarts and runs one temporary child')('tree', () => temporaryCrashTree),
        When('that child crashes')(
          'observation',
          ({ tree }) =>
            Effect.gen(function*() {
              const watching = yield* traceUntil(tree.supervisor, (trace) =>
                Arr.some(trace, (entry) =>
                  Match.value(entry.event).pipe(
                    Match.tag('ChildTerminated', (terminated) =>
                      terminated.childId === 'temp'),
                    Match.orElse(() => false),
                  )))
              yield* Queue.offer(tree.crashes, void 0)
              const trace = yield* settled(watching)
              const phase = yield* phaseOf(tree.supervisor)
              return { trace, phase }
            }),
        ),
        Then('the supervisor is still running')(({ observation }) => {
          expect(observation.phase).toBe('running')
        }),
        And('the supervisor never terminated itself')(({ observation }) => {
          expect(observation.trace).not.toSatisfy(terminatedIn)
        }),
      ),
    )

    scenario(
      'A transient child that finishes normally never gives up the supervisor',
      Gherkin.Do.pipe(
        Given('a supervisor allows no restarts and runs one transient child')('tree', () => transientFinishTree),
        When('that child finishes normally')(
          'observation',
          ({ tree }) =>
            Effect.gen(function*() {
              const watching = yield* traceUntil(tree.supervisor, (trace) =>
                Arr.some(trace, (entry) =>
                  Match.value(entry.event).pipe(
                    Match.tag('ChildTerminated', (terminated) =>
                      terminated.childId === 'done'),
                    Match.orElse(() => false),
                  )))
              yield* Queue.offer(tree.done, void 0)
              const trace = yield* settled(watching)
              const phase = yield* phaseOf(tree.supervisor)
              return { trace, phase }
            }),
        ),
        Then('the supervisor is still running')(({ observation }) => {
          expect(observation.phase).toBe('running')
        }),
        And('the supervisor never terminated itself')(({ observation }) => {
          expect(observation.trace).not.toSatisfy(terminatedIn)
        }),
      ),
    )

    scenario(
      'Under one_for_all a give-up takes down every child, including those a restart would spare',
      Gherkin.Do.pipe(
        Given('a one-for-all supervisor allows no restarts and runs a crasher beside two steady children')(
          'tree',
          () => oneForAllTree,
        ),
        When('the crasher crashes')(
          'observation',
          ({ tree }) =>
            Effect.gen(function*() {
              yield* Deferred.await(tree.secondStarted)
              yield* Deferred.await(tree.thirdStarted)
              yield* Queue.offer(tree.crashes, void 0)
              yield* Supervisor.awaitTerminated(tree.supervisor).pipe(Effect.flip)
              return yield* Ref.get(tree.stopped)
            }),
        ),
        Then('both steady children have been stopped')(({ observation }) => {
          expect(observation).toEqual(expect.arrayContaining(['b', 'c']))
        }),
      ),
    )

    scenario(
      'Under rest_for_one a give-up takes down an earlier child too',
      Gherkin.Do.pipe(
        Given('a rest-for-one supervisor allows no restarts and runs a steady child before the crasher')(
          'tree',
          () => restForOneTree,
        ),
        When('the crasher crashes')(
          'observation',
          ({ tree }) =>
            Effect.gen(function*() {
              yield* Deferred.await(tree.earlierStarted)
              yield* Queue.offer(tree.crashes, void 0)
              yield* Supervisor.awaitTerminated(tree.supervisor).pipe(Effect.flip)
              return yield* Ref.get(tree.stopped)
            }),
        ),
        Then('the earlier child has been stopped although a restart would have spared it')(
          ({ observation }) => {
            expect(observation).toContain('earlier')
          },
        ),
      ),
    )

    scenario(
      'A declared cool-down makes exhaustion resume supervision instead of failing the owner',
      Gherkin.Do.pipe(
        Given('a supervisor allows no restarts but declares a cool-down')('tree', () => coolDownTree),
        When('the child crashes')(
          'observation',
          ({ tree }) =>
            Effect.gen(function*() {
              const watching = yield* traceUntil(tree.supervisor, incarnationStarted('crasher', FIRST_INCARNATION + 1))
              yield* Queue.offer(tree.crashes, void 0)
              const trace = yield* settled(watching)
              const phase = yield* phaseOf(tree.supervisor)
              return { trace, phase }
            }),
        ),
        Then('the supervisor starts the child again after the cool-down')(({ observation }) => {
          expect(observation.trace).toSatisfy(incarnationStarted('crasher', FIRST_INCARNATION + 1))
        }),
        And('the supervisor is still running, so the owner was not failed')(({ observation }) => {
          expect(observation.phase).toBe('running')
          expect(observation.trace).not.toSatisfy(terminatedIn)
        }),
      ),
    )

    scenario(
      'A requested shutdown succeeds the owner wait',
      Gherkin.Do.pipe(
        Given('a supervisor runs one steady child')('tree', () => stoppedTree),
        When('the owner asks it to shut down')('phase', ({ tree }) =>
          Effect.gen(function*() {
            yield* Supervisor.shutdown(tree.supervisor)
            yield* Supervisor.awaitTerminated(tree.supervisor)
            return yield* phaseOf(tree.supervisor)
          })),
        Then('the supervisor has terminated and the wait did not fail')(({ phase }) => {
          expect(phase).toBe('terminated')
        }),
      ),
    )
  })
