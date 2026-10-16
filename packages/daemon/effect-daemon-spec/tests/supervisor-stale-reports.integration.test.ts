import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Effect, Match, Queue } from 'effect'
import { fiberMediumLayer } from './__fixtures__/FiberMediumHarness.js'
import { crashingChild, settled, traceUntil } from './__fixtures__/SupervisorHarness.js'

const Feature = makeFeature({ it })

type Trace = ReadonlyArray<Supervisor.TraceEntry>

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

const reportsTerminationOf = (childId: string) => (entry: Supervisor.TraceEntry): boolean =>
  Match.value(entry.event).pipe(
    Match.tag('ChildTerminated', (terminated) => terminated.childId === childId),
    Match.orElse(() => false),
  )

const readyAtGeneration = (generation: number) => (childId: string) => (trace: Trace): boolean =>
  Arr.some(trace, (entry) =>
    Match.value(entry.event).pipe(
      Match.tag('ChildReady', (ready) => ready.childId === childId && ready.generation === generation),
      Match.orElse(() => false),
    ))

const terminationReportSeen = (childId: string) => (trace: Trace): boolean =>
  Arr.some(trace, reportsTerminationOf(childId))

const terminationReportDecisions = (childId: string) => (trace: Trace) =>
  Arr.map(Arr.filter(trace, reportsTerminationOf(childId)), (entry) => entry.decision)

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

Feature('Reports from a child the supervisor has already replaced')
  .withLayer(fiberMediumLayer)
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
        Then("the replaced incarnation's report has no effect and both children run in their new incarnation")(
          ({ after }, expect) =>
            expect({
              decisions: terminationReportDecisions('b')(after.trace),
              incarnations: after.incarnations,
            }).toEqual({
              decisions: [{ _tag: 'Stale' }],
              incarnations: [['a', 1, 'ready'], ['b', 1, 'ready']],
            }),
        ),
      ),
    )
  })
