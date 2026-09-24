import { expect } from '@effect/vitest'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Cause, Clock, Deferred, Effect, Match, Queue, Ref, Schema } from 'effect'
import { crashingChild, neverChild, settled, terminatedIn, traceUntil } from './__fixtures__/SupervisorHarness.js'

const Feature = makeFeature({ it })

type Trace = ReadonlyArray<Supervisor.TraceEntry>

const FIRST_INCARNATION = 0

const isSupervisorTerminated = Schema.is(Supervisor.SupervisorTerminated)

const defectsOf = (cause: Supervisor.SupervisorTerminated['cause']) =>
  Arr.flatMap(cause.reasons, (reason) => Cause.isDieReason(reason) ? [reason.defect] : [])

const errorsOf = (
  cause: Supervisor.SupervisorTerminated['cause'],
): ReadonlyArray<Supervisor.SupervisorTerminated> =>
  Arr.flatMap(
    cause.reasons,
    (reason) => Cause.isFailReason(reason) && isSupervisorTerminated(reason.error) ? [reason.error] : [],
  )

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

const nestedChildTree = Effect.gen(function*() {
  const crashes = yield* Queue.unbounded<void>()
  const inner = Supervisor.make('inner').pipe(
    Supervisor.intensity(0, 5_000),
    Supervisor.children([Supervisor.ChildSpecs.make('crasher', crashingChild(crashes))]),
  )
  const parent = yield* Supervisor.make('outer').pipe(
    Supervisor.intensity(5, 5_000),
    Supervisor.children([Supervisor.ChildSpecs.make('inner', inner)]),
  ).scoped
  return { crashes, parent }
})

const escalatingTree = Effect.gen(function*() {
  const crashes = yield* Queue.unbounded<void>()
  const inner = Supervisor.make('inner').pipe(
    Supervisor.intensity(0, 5_000),
    Supervisor.children([Supervisor.ChildSpecs.make('crasher', crashingChild(crashes))]),
  )
  const outer = yield* Supervisor.make('outer').pipe(
    Supervisor.intensity(1, 5_000),
    Supervisor.children([Supervisor.ChildSpecs.make('inner', inner)]),
  ).scoped
  return { crashes, outer }
})

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

Feature('An owner whose supervisor gives up')
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

Feature('A supervisor giving up under another supervisor')
  .body(({ scenario }) => {
    scenario(
      'A nested supervisor that gives up is one abnormal child its parent restarts',
      Gherkin.Do.pipe(
        Given('an inner supervisor allows no restarts and runs under a parent that allows many')(
          'tree',
          () => nestedChildTree,
        ),
        When('the inner supervisor gives up')(
          'trace',
          ({ tree }) =>
            Effect.gen(function*() {
              const watching = yield* traceUntil(
                tree.parent,
                (trace) =>
                  abnormalEnding('inner', FIRST_INCARNATION)(trace) &&
                  incarnationStarted('inner', FIRST_INCARNATION + 1)(trace),
              )
              yield* Queue.offer(tree.crashes, void 0)
              return yield* settled(watching)
            }),
        ),
        Then('the parent hears one abnormal ending for the inner supervisor')(({ trace }) => {
          expect(trace).toSatisfy(abnormalEnding('inner', FIRST_INCARNATION))
        }),
        And('the parent starts the inner supervisor again')(({ trace }) => {
          expect(trace).toSatisfy(incarnationStarted('inner', FIRST_INCARNATION + 1))
        }),
      ),
    )

    scenario(
      'Escalating give-ups reach the top-level owner carrying the inner failure',
      Gherkin.Do.pipe(
        Given('an inner supervisor allows no restarts under a parent that allows one')(
          'tree',
          () => escalatingTree,
        ),
        When('the inner supervisor gives up twice')(
          'failure',
          ({ tree }) =>
            Effect.gen(function*() {
              yield* Effect.forEach(Arr.range(1, 2), () => Queue.offer(tree.crashes, void 0), { discard: true })
              return yield* Supervisor.awaitTerminated(tree.outer).pipe(Effect.flip)
            }),
        ),
        Then('the owner sees a typed give-up naming the outer supervisor')(({ failure }) => {
          expect(failure).toBeInstanceOf(Supervisor.SupervisorTerminated)
          expect(failure.name).toBe('outer')
        }),
        And('the outer cause carries the inner give-up')(({ failure }) => {
          const innerErrors: ReadonlyArray<Supervisor.SupervisorTerminated> = failure.cause.pipe(errorsOf)
          expect(innerErrors).toSatisfy((values: ReadonlyArray<Supervisor.SupervisorTerminated>) =>
            values.some((value) => value.name === 'inner')
          )
        }),
      ),
    )
  })

Feature('A supervisor whose exhaustion does not end it')
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
