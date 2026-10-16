import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Cause, Effect, Match, Queue, Schema } from 'effect'
import { fiberMediumLayer } from './__fixtures__/FiberMediumHarness.js'
import { crashingChild, settled, traceUntil } from './__fixtures__/SupervisorHarness.js'

const Feature = makeFeature({ it })

type Trace = ReadonlyArray<Supervisor.TraceEntry>

const FIRST_INCARNATION = 0

const isSupervisorTerminated = Schema.is(Supervisor.SupervisorTerminated)

const errorsOf = (
  cause: Supervisor.SupervisorTerminated['cause'],
): ReadonlyArray<Supervisor.SupervisorTerminated> =>
  Arr.flatMap(
    cause.reasons,
    (reason) => Cause.isFailReason(reason) && isSupervisorTerminated(reason.error) ? [reason.error] : [],
  )

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

Feature('A supervisor giving up under another supervisor')
  .withLayer(fiberMediumLayer)
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
        Then('the parent hears one abnormal ending for the inner supervisor and starts it again')(
          ({ trace }, expect) =>
            expect({
              endedAbnormally: abnormalEnding('inner', FIRST_INCARNATION)(trace),
              restarted: incarnationStarted('inner', FIRST_INCARNATION + 1)(trace),
            }).toEqual({ endedAbnormally: true, restarted: true }),
        ),
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
        Then('the owner sees a typed give-up naming the outer supervisor, whose cause carries the inner give-up')(
          ({ failure }, expect) => {
            const innerNames = failure.cause.pipe(errorsOf).map((error) => error.name)
            return expect({
              failure: failure,
              name: failure.name,
              innerNames,
            }).toMatchObject({
              failure: expect.schemaMatching(Supervisor.SupervisorTerminated),
              name: 'outer',
              innerNames: expect.arrayContaining(['inner']),
            })
          },
        ),
      ),
    )
  })
