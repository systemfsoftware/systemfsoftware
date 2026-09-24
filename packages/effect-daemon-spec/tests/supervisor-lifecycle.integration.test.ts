import { expect } from '@effect/vitest'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Deferred, Effect, Match, Queue, Ref } from 'effect'
import { crashingChild, neverChild, settled, traceUntil } from './__fixtures__/SupervisorHarness.js'

const Feature = makeFeature({ it, layer })

type Trace = ReadonlyArray<Supervisor.TraceEntry>

/** The children the supervisor is running, in the order its state holds them. */
const runningChildIds = (supervisor: Supervisor.RunningSupervisor): Effect.Effect<ReadonlyArray<string>> =>
  Effect.map(Supervisor.statusOf(supervisor), (state) =>
    Match.value(state).pipe(
      Match.tag('Terminated', () => Arr.empty<string>()),
      Match.orElse((running) => Arr.map(running.core.children, (child) => child.childId)),
    ))

const phaseOf = (supervisor: Supervisor.RunningSupervisor): Effect.Effect<string> =>
  Effect.map(Supervisor.statusOf(supervisor), (state) =>
    Match.value(state).pipe(
      Match.tag('Terminated', () => 'terminated'),
      Match.orElse(() => 'running'),
    ))

/** Every running child's incarnation: its identity, its generation and its status. */
const runningIncarnations = (
  supervisor: Supervisor.RunningSupervisor,
): Effect.Effect<ReadonlyArray<readonly [string, number, string]>> =>
  Effect.map(Supervisor.statusOf(supervisor), (state) =>
    Match.value(state).pipe(
      Match.tag('Terminated', () => Arr.empty<readonly [string, number, string]>()),
      Match.orElse((running) =>
        Arr.map(running.core.children, (child) => [child.childId, child.generation, child.status] as const)
      ),
    ))

/** Whether this entry is a report that the child terminated. */
const reportsTerminationOf = (childId: string) => (entry: Supervisor.TraceEntry): boolean =>
  Match.value(entry.event).pipe(
    Match.tag('ChildTerminated', (terminated) => terminated.childId === childId),
    Match.orElse(() => false),
  )

/** Whether the trace has seen this incarnation of the child announce itself ready. */
const readyAtGeneration = (generation: number) => (childId: string) => (trace: Trace): boolean =>
  Arr.some(trace, (entry) =>
    Match.value(entry.event).pipe(
      Match.tag('ChildReady', (ready) => ready.childId === childId && ready.generation === generation),
      Match.orElse(() => false),
    ))

/** Whether the trace has seen the child stop. */
const stoppedSeen = (childId: string) => (trace: Trace): boolean =>
  Arr.some(trace, (entry) =>
    Match.value(entry.event).pipe(
      Match.tag('ChildStopped', (stopped) => stopped.childId === childId),
      Match.orElse(() => false),
    ))

/** Whether the trace has seen any report that the child terminated. */
const terminationReportSeen = (childId: string) => (trace: Trace): boolean =>
  Arr.some(trace, reportsTerminationOf(childId))

/** The decisions every report about a child's termination was answered with. */
const terminationReportDecisions = (childId: string) => (trace: Trace) =>
  Arr.map(Arr.filter(trace, reportsTerminationOf(childId)), (entry) => entry.decision)

/** The child a start answer names, or an empty identity when the answer names none. */
const childIdOfStart = (answer: Supervisor.DynamicOutcome): string =>
  Match.value(answer).pipe(
    Match.when({ outcome: 'accepted' }, (accepted) => accepted.childId),
    Match.orElse(() => ''),
  )

/** The two children a one-for-all supervisor runs, each crashing only on its own signal. */
const oneForAllPair = Effect.gen(function*() {
  const firstCrash = yield* Queue.unbounded<void>()
  const secondCrash = yield* Queue.unbounded<void>()
  const supervisor = yield* Supervisor.make('one-for-all-pair').pipe(
    Supervisor.strategy('one_for_all'),
    Supervisor.children([
      Supervisor.ChildSpecs.make('a', crashingChild(firstCrash)),
      Supervisor.ChildSpecs.make('b', crashingChild(secondCrash)),
    ]),
  ).scoped
  return { firstCrash, supervisor }
})

/** A supervisor that takes new children up to `ceiling`, running none of its own. */
const dynamicSupervisor = (name: string, ceiling: number) =>
  Effect.map(
    Supervisor.make(name).pipe(Supervisor.dynamic({ ceiling })).scoped,
    (supervisor) => ({ supervisor }),
  )

/**
 * A child that records its own start in the test's log and, from its finalizer,
 * the moment it is stopped, so a scope close can be read off the log afterwards.
 */
const recordingChild = (
  log: Ref.Ref<ReadonlyArray<string>>,
  name: string,
  started: Deferred.Deferred<void>,
): Supervisor.FiberProgram =>
(ready) =>
  Effect.ensuring(
    Effect.andThen(
      Effect.andThen(ready, Ref.update(log, (seen) => Arr.append(seen, name))),
      Effect.andThen(Deferred.succeed(started, void 0), Effect.never),
    ),
    Ref.update(log, (seen) => Arr.append(seen, `${name} stopped`)),
  )

const twoRecordingChildren = Effect.gen(function*() {
  const log = yield* Ref.make<ReadonlyArray<string>>(Arr.empty<string>())
  const alphaStarted = yield* Deferred.make<void>()
  const betaStarted = yield* Deferred.make<void>()
  return {
    log,
    alphaStarted,
    betaStarted,
    spec: Supervisor.make('scope-close-tree').pipe(
      Supervisor.children([
        Supervisor.ChildSpecs.make('alpha', recordingChild(log, 'alpha', alphaStarted)),
        Supervisor.ChildSpecs.make('beta', recordingChild(log, 'beta', betaStarted)),
      ]),
    ),
  }
})

Feature('Shutting a supervision tree down when the scope it runs in closes')
  .body(({ scenario }) => {
    scenario(
      'The scope stops each child in reverse of the order it started that child',
      Gherkin.Do.pipe(
        Given('a supervisor running two children, each of which records its own shutdown')(
          'tree',
          () => twoRecordingChildren,
        ),
        When('the scope the supervisor was started in closes')('record', ({ tree }) =>
          Effect.gen(function*() {
            const started = yield* Effect.scoped(Effect.gen(function*() {
              yield* tree.spec.scoped
              yield* Deferred.await(tree.alphaStarted)
              yield* Deferred.await(tree.betaStarted)
              return yield* Ref.get(tree.log)
            }))
            const afterwards = yield* Ref.get(tree.log)
            return { started, afterwards }
          })),
        Then('the children stopped in reverse of the order they started')(({ record }) => {
          expect(record.afterwards).toEqual(['alpha', 'beta', 'beta stopped', 'alpha stopped'])
        }),
        And('the scope closed only after the last child had stopped')(({ record }) => {
          expect(record.started).toEqual(['alpha', 'beta'])
          expect(record.afterwards.slice(-1)).toEqual(['alpha stopped'])
        }),
      ),
    )

    scenario(
      'A supervisor that runs no children still finishes terminating',
      Gherkin.Do.pipe(
        Given('a supervisor that runs no children')(
          'tree',
          () => Effect.succeed({ spec: Supervisor.make('childless-tree') }),
        ),
        When('the scope it was started in closes')('phase', ({ tree }) =>
          Effect.gen(function*() {
            const supervisor = yield* Effect.scoped(tree.spec.scoped)
            yield* Supervisor.awaitTerminated(supervisor)
            return yield* phaseOf(supervisor)
          })),
        Then('the supervisor has terminated')(({ phase }) => {
          expect(phase).toBe('terminated')
        }),
      ),
    )
  })

Feature('Growing and shrinking a running supervision tree')
  .body(({ scenario }) => {
    scenario(
      'A start beyond the declared ceiling is turned away',
      Gherkin.Do.pipe(
        Given('a supervisor that takes new children up to a ceiling of two')(
          'tree',
          () => dynamicSupervisor('ceiling-tree', 2),
        ),
        When('three children are started in turn')('answers', ({ tree }) =>
          Effect.gen(function*() {
            const first = yield* Supervisor.startChild(tree.supervisor, neverChild)
            const second = yield* Supervisor.startChild(tree.supervisor, neverChild)
            const before = yield* runningChildIds(tree.supervisor)
            const third = yield* Supervisor.startChild(tree.supervisor, neverChild)
            const after = yield* runningChildIds(tree.supervisor)
            return { first, second, third, before, after }
          })),
        Then('the first two answers name the children the supervisor allocated')(({ answers }) => {
          expect(answers.first).toEqual({ outcome: 'accepted', childId: 'd0', generation: 0 })
          expect(answers.second).toEqual({ outcome: 'accepted', childId: 'd1', generation: 0 })
        }),
        And('the third is turned away and the running children are unchanged')(({ answers }) => {
          expect(answers.third).toEqual({ outcome: 'refused' })
          expect(answers.before).toEqual(['d0', 'd1'])
          expect(answers.after).toEqual(['d0', 'd1'])
        }),
      ),
    )

    scenario(
      'A child stopped on request leaves the tree',
      Gherkin.Do.pipe(
        Given('a supervisor that takes new children up to a ceiling of two, running one it allocated')(
          'tree',
          () =>
            Effect.gen(function*() {
              const tree = yield* dynamicSupervisor('stop-tree', 2)
              const answer = yield* Supervisor.startChild(tree.supervisor, neverChild)
              return { ...tree, answer }
            }),
        ),
        When('that child is stopped, and then the same incarnation is stopped again')(
          'answers',
          ({ tree }) =>
            Effect.gen(function*() {
              const childId = childIdOfStart(tree.answer)
              const leaving = yield* traceUntil(tree.supervisor, stoppedSeen(childId))
              const answer = yield* Supervisor.stopChild(tree.supervisor, childId, 0)
              yield* settled(leaving)
              yield* Effect.yieldNow
              const remaining = yield* runningChildIds(tree.supervisor)
              const again = yield* Supervisor.stopChild(tree.supervisor, childId, 0)
              const afterwards = yield* runningChildIds(tree.supervisor)
              return { answer, remaining, again, afterwards }
            }),
        ),
        Then('the first stop is answered as done and the child leaves the tree')(({ answers }) => {
          expect(answers.answer).toEqual({ outcome: 'stopped' })
          expect(answers.remaining).toEqual([])
        }),
        And('the second stop finds no such incarnation')(({ answers }) => {
          expect(answers.again).toEqual({ outcome: 'missed' })
          expect(answers.afterwards).toEqual([])
        }),
      ),
    )

    scenario(
      'A request made after the supervisor has stopped is still answered',
      Gherkin.Do.pipe(
        Given('a supervisor that takes new children up to a ceiling of two, which has since shut down')(
          'tree',
          () =>
            Effect.gen(function*() {
              const tree = yield* dynamicSupervisor('stopped-tree', 2)
              yield* Supervisor.shutdown(tree.supervisor)
              return tree
            }),
        ),
        When('a new child is asked for and a child is asked to stop')('answers', ({ tree }) =>
          Effect.gen(function*() {
            const start = yield* Supervisor.startChild(tree.supervisor, neverChild)
            const stop = yield* Supervisor.stopChild(tree.supervisor, 'd0', 0)
            return { start, stop }
          })),
        Then('the new child is turned away')(({ answers }) => {
          expect(answers.start).toEqual({ outcome: 'refused' })
        }),
        And('the stop finds no such child')(({ answers }) => {
          expect(answers.stop).toEqual({ outcome: 'missed' })
        }),
      ),
    )

    scenario(
      'A stop naming an incarnation that cannot exist is answered at once',
      Gherkin.Do.pipe(
        Given('a supervisor that takes new children up to a ceiling of two, running one it allocated')(
          'tree',
          () =>
            Effect.gen(function*() {
              const tree = yield* dynamicSupervisor('impossible-stop-tree', 2)
              const answer = yield* Supervisor.startChild(tree.supervisor, neverChild)
              return { ...tree, answer }
            }),
        ),
        When('a stop names an incarnation of that child that could never have been started')(
          'answers',
          ({ tree }) =>
            Effect.gen(function*() {
              const answer = yield* Supervisor.stopChild(tree.supervisor, childIdOfStart(tree.answer), -1)
              const remaining = yield* runningChildIds(tree.supervisor)
              return { answer, remaining }
            }),
        ),
        Then('the stop finds no such child')(({ answers }) => {
          expect(answers.answer).toEqual({ outcome: 'missed' })
        }),
        And('the running child stays in the tree')(({ answers }) => {
          expect(answers.remaining).toEqual(['d0'])
        }),
      ),
    )
  })

Feature('Reports from a child the supervisor has already replaced')
  .body(({ scenario }) => {
    scenario(
      "A one-for-all restart leaves the replaced incarnation's report without effect",
      Gherkin.Do.pipe(
        Given('a one-for-all supervisor running two children, each of which crashes when signalled')(
          'tree',
          () => oneForAllPair,
        ),
        When('the first child crashes')('after', ({ tree }) =>
          Effect.gen(function*() {
            const watching = yield* traceUntil(
              tree.supervisor,
              (trace) =>
                terminationReportSeen('b')(trace) &&
                Arr.every(['a', 'b'], (childId) => readyAtGeneration(1)(childId)(trace)),
            )
            yield* Queue.offer(tree.firstCrash, void 0)
            const trace = yield* settled(watching)
            yield* Effect.yieldNow
            const incarnations = yield* runningIncarnations(tree.supervisor)
            return { trace, incarnations }
          })),
        Then('the report from the replaced incarnation has no effect')(({ after }) => {
          expect(terminationReportDecisions('b')(after.trace)).toEqual([{ _tag: 'Stale' }])
        }),
        And('both children are running in their new incarnation')(({ after }) => {
          expect(after.incarnations).toEqual([['a', 1, 'ready'], ['b', 1, 'ready']])
        }),
      ),
    )
  })
