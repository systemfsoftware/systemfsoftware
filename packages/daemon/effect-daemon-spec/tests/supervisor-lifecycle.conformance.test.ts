/**
 * The supervisor's own concurrency primitives, judged through the simulation kernel.
 *
 * The lifecycle check drives `Supervisor.make`, `statusOf`, `startChild` and `stopChild`
 * against a pure model of the running set, so the refs, queues, deferreds and forked
 * loops that serve those operations execute inside a conformance check. The give-up
 * check drives the same machinery down the intensity-exceeded path.
 */
import { Conformance } from '@systemfsoftware/conformance-spec'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Context, Effect, Exit, Layer, Match, Option, Queue, Ref } from 'effect'
import {
  DECLARED,
  ExhaustCommand,
  exhaustModel,
  LifecycleCommand,
  lifecycleModel,
} from './__fixtures__/supervisor-conformance.schema.js'
import type { LifecycleResponse } from './__fixtures__/supervisor-conformance.schema.js'

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

class Doomed extends Context.Service<
  Doomed,
  { readonly supervisor: Supervisor.RunningSupervisor; readonly crashes: Queue.Queue<void> }
>()('@systemfsoftware/effect-daemon-spec/tests/supervisor-lifecycle.conformance.test/Doomed') {}

const doomedPool: Layer.Layer<Doomed> = Layer.effect(
  Doomed,
  Effect.gen(function*() {
    const crashes = yield* Queue.unbounded<void>()
    const supervisor = yield* Supervisor.make('doomed').pipe(
      Supervisor.intensity(0, 5_000),
      Supervisor.children([
        Supervisor.ChildSpecs.make(
          'crasher',
          Supervisor.readyOnStart(Effect.andThen(Queue.take(crashes), Effect.die('crashed'))),
        ),
      ]),
    ).scoped
    return { supervisor, crashes }
  }),
)

const runExhaust = (_command: ExhaustCommand): Effect.Effect<boolean, never, Doomed> =>
  Effect.flatMap(Doomed, ({ supervisor, crashes }) =>
    Effect.gen(function*() {
      yield* Queue.offer(crashes, void 0)
      const exit = yield* Effect.exit(Supervisor.awaitTerminated(supervisor))
      return Exit.isFailure(exit)
    }))

const exhaustCheck = Conformance.sequential(doomedPool, {
  commands: ExhaustCommand,
  model: exhaustModel,
  run: runExhaust,
  sequences: 25,
  operations: 3,
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
          expect(state.report).toMatchObject({ _tag: 'Pass' })
        ),
      ),
    )
  })

Feature('Exhausting a supervisor through the conformance harness', { timeout: 0 })
  .withLayer(Layer.empty)
  .live(liveReason)
  .body(({ scenario }) => {
    scenario(
      'A child that crashes past the allowed restarts hands its owner the give-up',
      Gherkin.Do.pipe(
        Given('a supervisor that allows no restarts and runs a child that crashes on request')(
          'check',
          () => Effect.succeed(exhaustCheck),
        ),
        When('generated runs ask the child to crash')('report', (s) => s.check),
        Then('every run ends with the owner seeing the give-up')((state, expect) =>
          expect(state.report).toMatchObject({ _tag: 'Pass' })
        ),
      ),
    )
  })
