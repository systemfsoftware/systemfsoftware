/**
 * The supervisor's give-up path, judged through the simulation kernel.
 *
 * The exhaustion check drives `Supervisor.make`, `awaitTerminated` and the intensity
 * ceiling against a pure model of the running set, so the refs, queues, deferreds and
 * forked loops that serve those operations execute inside a conformance check.
 */
import { Conformance } from '@systemfsoftware/conformance-spec'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Exit, Layer, Queue } from 'effect'
import { ExhaustCommand, exhaustModel } from './__fixtures__/supervisor-conformance.model.js'

const Feature = makeFeature({ it })

class Doomed extends Context.Service<
  Doomed,
  { readonly supervisor: Supervisor.RunningSupervisor; readonly crashes: Queue.Queue<void> }
>()('@systemfsoftware/effect-daemon-spec/tests/supervisor-exhaustion.conformance.test/Doomed') {}

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
          expect(state.report, Conformance.render(state.report)).toMatchObject({ _tag: 'Pass' })
        ),
      ),
    )
  })
