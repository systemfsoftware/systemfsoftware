import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Deferred, Duration, Effect, Match, Queue, Ref } from 'effect'
import { expect } from 'vitest'
import { crashingChild, settled, traceUntil } from './__fixtures__/SupervisorHarness.js'

const Feature = makeFeature({ it, layer })

type Trace = ReadonlyArray<Supervisor.TraceEntry>

const FIRST_INCARNATION = 0

const recordingChild = (childId: string, stopped: Ref.Ref<ReadonlyArray<string>>): Supervisor.FiberProgram =>
  Supervisor.readyOnStart(Effect.never.pipe(Effect.ensuring(Ref.update(stopped, (seen) => Arr.append(seen, childId)))))

const slowStoppingChild = (
  childId: string,
  began: Deferred.Deferred<void>,
  stopped: Ref.Ref<ReadonlyArray<string>>,
): Supervisor.FiberProgram =>
  Supervisor.readyOnStart(
    Effect.ensuring(
      Effect.andThen(Deferred.succeed(began, void 0), Effect.never),
      Effect.andThen(
        Effect.sleep(Duration.seconds(2)),
        Ref.update(stopped, (seen) => Arr.append(seen, childId)),
      ),
    ),
  )

const childEnded = (childId: string) => (trace: Trace): boolean =>
  Arr.some(trace, (entry) =>
    Match.value(entry.event).pipe(
      Match.tag('ChildTerminated', (terminated) => terminated.childId === childId),
      Match.orElse(() => false),
    ))

const reportedStopped = (childId: string) => (trace: Trace): boolean =>
  Arr.some(trace, (entry) =>
    Match.value(entry.event).pipe(
      Match.tag('ChildTerminated', (terminated) =>
        Match.value(terminated.reason).pipe(
          Match.tag('Shutdown', () => terminated.childId === childId),
          Match.orElse(() => false),
        )),
      Match.orElse(() => false),
    ))

const firstIncarnationEndings = (childId: string) => (trace: Trace): number =>
  Arr.length(
    Arr.filter(trace, (entry) =>
      Match.value(entry.event).pipe(
        Match.tag('ChildTerminated', (terminated) =>
          Match.value(terminated.childId === childId).pipe(
            Match.when(true, () => terminated.generation === FIRST_INCARNATION),
            Match.when(false, () => false),
            Match.exhaustive,
          )),
        Match.orElse(() => false),
      )),
  )

const nestedRestartTree = Effect.gen(function*() {
  const crashes = yield* Queue.unbounded<void>()
  const stopped = yield* Ref.make<ReadonlyArray<string>>([])
  const inner = Supervisor.make('inner').pipe(
    Supervisor.intensity(3, 5_000),
    Supervisor.children([
      Supervisor.ChildSpecs.make('grinder', crashingChild(crashes)),
      Supervisor.ChildSpecs.make('idler', recordingChild('idler', stopped)),
    ]),
  )
  const parent = yield* Supervisor.make('outer').pipe(
    Supervisor.children([Supervisor.ChildSpecs.make('inner', inner)]),
  ).scoped
  return { crashes, stopped, parent }
})

const slowStoppingTree = Effect.gen(function*() {
  const alphaBegan = yield* Deferred.make<void>()
  const betaBegan = yield* Deferred.make<void>()
  const stopped = yield* Ref.make<ReadonlyArray<string>>([])
  const inner = Supervisor.make('inner').pipe(
    Supervisor.children([
      Supervisor.ChildSpecs.make('alpha', slowStoppingChild('alpha', alphaBegan, stopped)),
      Supervisor.ChildSpecs.make('beta', slowStoppingChild('beta', betaBegan, stopped)),
    ]),
  )
  const parent = yield* Supervisor.make('outer').pipe(
    Supervisor.children([Supervisor.ChildSpecs.make('inner', inner)]),
  ).scoped
  return { alphaBegan, betaBegan, stopped, parent }
})

Feature('Supervising a supervisor')
  .body(({ scenario }) => {
    scenario(
      'A nested supervisor that runs out of restart intensity takes its children down and ends',
      Gherkin.Do.pipe(
        Given('a supervisor allows three restarts in five seconds and runs under a parent')(
          'tree',
          () => nestedRestartTree,
        ),
        When('its children fail a fourth time')(
          'observation',
          ({ tree }) =>
            Effect.gen(function*() {
              const watching = yield* traceUntil(tree.parent, childEnded('inner'))
              yield* Effect.forEach(Arr.range(1, 4), () => Queue.offer(tree.crashes, void 0), { discard: true })
              const trace = yield* settled(watching)
              const stopped = yield* Ref.get(tree.stopped)
              return { trace, stopped }
            }),
        ),
        Then('the child that never failed is stopped as well')(({ observation }) => {
          expect(observation.stopped).toContain('idler')
        }),
        And('the parent hears exactly one ending for the first incarnation')(({ observation }) => {
          expect(firstIncarnationEndings('inner')(observation.trace)).toBe(1)
        }),
      ),
    )

    scenario(
      "A nested supervisor's children finish stopping before the parent hears it stopped",
      Gherkin.Do.pipe(
        Given('a supervisor runs two slow-stopping children under a parent')('tree', () => slowStoppingTree),
        When('the parent shuts it down')(
          'observation',
          ({ tree }) =>
            Effect.gen(function*() {
              yield* Effect.all(
                [Deferred.await(tree.alphaBegan), Deferred.await(tree.betaBegan)],
                { concurrency: 'unbounded' },
              )
              const watching = yield* traceUntil(tree.parent, reportedStopped('inner'))
              yield* Effect.forkScoped(Supervisor.shutdown(tree.parent))
              const trace = yield* settled(watching)
              const stopped = yield* Ref.get(tree.stopped)
              return { trace, stopped }
            }),
        ),
        Then('every child has finished stopping by the time the parent hears it stopped')(({ observation }) => {
          expect(reportedStopped('inner')(observation.trace)).toBe(true)
          expect(observation.stopped).toEqual(expect.arrayContaining(['alpha', 'beta']))
          expect(observation.stopped).toHaveLength(2)
        }),
      ),
    )
  })
