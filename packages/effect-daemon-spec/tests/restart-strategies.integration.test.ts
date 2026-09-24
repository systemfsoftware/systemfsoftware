import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Effect, Queue } from 'effect'
import { fiberMediumLayer } from './__fixtures__/FiberMediumHarness.js'
import {
  crashingChild,
  neverChild,
  settled,
  sinceTerminationOf,
  startedIn,
  stoppedIn,
  traceUntil,
} from './__fixtures__/SupervisorHarness.js'

const Feature = makeFeature({ it })

const restForOneTree = Effect.gen(function*() {
  const crashes = yield* Queue.unbounded<void>()
  const supervisor = yield* Supervisor.make('lattice').pipe(
    Supervisor.strategy('rest_for_one'),
    Supervisor.children([
      Supervisor.ChildSpecs.make('a', neverChild),
      Supervisor.ChildSpecs.make('b', crashingChild(crashes)),
      Supervisor.ChildSpecs.make('c', neverChild, { restartType: 'temporary' }),
    ]),
  ).scoped
  return { crashes, supervisor }
})

const restartedAfterCrash = (childId: string) => (trace: ReadonlyArray<Supervisor.TraceEntry>): boolean =>
  Arr.contains(startedIn(sinceTerminationOf(childId)(trace)), childId)

Feature('Restarting the children a crash affects')
  .withLayer(fiberMediumLayer)
  .body(({ scenario }) => {
    scenario(
      'A crash under rest-for-one stops the later siblings and restarts only those that should come back',
      Gherkin.Do.pipe(
        Given('a rest-for-one supervisor was running a and b, then a temporary c')('tree', () => restForOneTree),
        When('b crashes')('trace', ({ tree }) =>
          Effect.gen(function*() {
            const watching = yield* traceUntil(tree.supervisor, restartedAfterCrash('b'))
            yield* Queue.offer(tree.crashes, void 0)
            return sinceTerminationOf('b')(yield* settled(watching))
          })),
        Then('c is stopped first then b, and b is the only child started again')((state, expect) =>
          expect({
            stopped: stoppedIn(state.trace),
            started: startedIn(state.trace),
          }).toEqual({ stopped: ['c', 'b'], started: ['b'] })
        ),
      ),
    )
  })
