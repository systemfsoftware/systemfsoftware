/**
 * The supervisor's own concurrency primitives, judged through the simulation kernel.
 *
 * The lifecycle check drives `Supervisor.make`, `statusOf`, `startChild` and `stopChild`
 * against a pure model of the running set, so the refs, queues, deferreds and forked
 * loops that serve those operations execute inside a conformance check.
 */
import { Conformance } from '@systemfsoftware/conformance-spec'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Context, Effect, Layer, Match, Option, Ref } from 'effect'
import { DECLARED, LifecycleCommand, lifecycleModel } from './__fixtures__/supervisor-conformance.model.js'
import type { LifecycleResponse } from './__fixtures__/supervisor-conformance.model.js'

const Feature = makeFeature({ it })

/** The child both checks' supervisors run: it reports ready at once and runs until it is stopped. */
const steadyChild: Supervisor.FiberProgram = Supervisor.readyOnStart(Effect.never)

class Lifecycle extends Context.Service<
  Lifecycle,
  {
    readonly supervisor: Supervisor.RunningSupervisor
    readonly dynamic: Ref.Ref<Option.Option<Supervisor.DynamicStartAccepted>>
  }
>()('@systemfsoftware/effect-daemon-spec/tests/supervisor-lifecycle.conformance.test/Lifecycle') {}

const lifecyclePool: Layer.Layer<Lifecycle> = Layer.effect(
  Lifecycle,
  Effect.gen(function*() {
    const supervisor = yield* Supervisor.make('lifecycle').pipe(
      Supervisor.dynamic({ ceiling: DECLARED + 1 }),
      Supervisor.children([Supervisor.ChildSpecs.make('steady', steadyChild)]),
    ).scoped
    return { supervisor, dynamic: yield* Ref.make(Option.none<Supervisor.DynamicStartAccepted>()) }
  }),
)

const settledAfter = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.tap(effect, () => Effect.yieldNow)

const runLifecycle = (command: LifecycleCommand): Effect.Effect<LifecycleResponse, never, Lifecycle> =>
  Effect.flatMap(Lifecycle, ({ supervisor, dynamic }) =>
    Match.value(command).pipe(
      Match.when('Status', () =>
        settledAfter(
          Effect.map(Supervisor.statusOf(supervisor), (state) =>
            Match.value(state).pipe(
              Match.tag('Running', (running) => Arr.length(running.core.children)),
              Match.orElse(() => -1),
            )),
        )),
      Match.when('Start', () =>
        settledAfter(
          Supervisor.startChild(supervisor, steadyChild).pipe(
            Effect.tap((answer) =>
              Match.value(answer).pipe(
                Match.when({ outcome: 'accepted' }, (accepted) => Ref.set(dynamic, Option.some(accepted))),
                Match.orElse(() => Effect.void),
              )
            ),
            Effect.map((answer) => answer.outcome),
            Effect.orDie,
          ),
        )),
      Match.when('Stop', () =>
        settledAfter(
          Effect.flatMap(Ref.get(dynamic), (known) =>
            Option.match(known, {
              onNone: () => Effect.succeed<Supervisor.DynamicOutcome>({ outcome: 'missed' }),
              onSome: (accepted) => Supervisor.stopChild(supervisor, accepted.childId, accepted.generation),
            })).pipe(
              Effect.map((answer) => answer.outcome),
              Effect.orDie,
            ),
        )),
      Match.exhaustive,
    ))

const lifecycleCheck = Conformance.sequential(lifecyclePool, {
  commands: LifecycleCommand,
  model: lifecycleModel,
  run: runLifecycle,
  sequences: 25,
  operations: 6,
})

const liveReason =
  'each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run'

Feature('Running a supervisor against the conformance harness', { timeout: 0 })
  .withLayer(Layer.empty)
  .live(liveReason)
  .body(({ scenario }) => {
    scenario(
      'Starting and stopping children leaves the running set the model predicts',
      Gherkin.Do.pipe(
        Given('a supervisor that declares one child and takes one more on request')(
          'check',
          () => Effect.succeed(lifecycleCheck),
        ),
        When('generated runs of status, starts and stops are played against it')('report', (s) => s.check),
        Then('every run answers with the child set the model predicts')((state, expect) =>
          expect(state.report, Conformance.render(state.report)).toMatchObject({ _tag: 'Pass' })
        ),
      ),
    )
  })
