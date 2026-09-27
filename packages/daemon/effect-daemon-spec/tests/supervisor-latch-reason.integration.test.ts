import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Cause, Effect, Exit, Fiber, Layer, Match, Option, Scope } from 'effect'

const Feature = makeFeature({ it })

type ChildTask = Effect.Effect<void, never, Scope.Scope>

const LatchPort = Supervisor.Medium.MediumPort<ChildTask, never, Scope.Scope>('LatchReasonMedium')

const unreportedExit: Supervisor.Medium.FailureReport = { _tag: 'ExitReport', code: 3, signal: 'unreported' }

const undyingMedium: Supervisor.Medium.Medium<ChildTask, never, Scope.Scope> = Supervisor.Medium.make({
  declaration: { reporting: 'exit', groupStop: 'atomic' },
  start: () => Effect.succeed(Supervisor.Medium.started(Effect.void)),
  report: () => Effect.succeed<Supervisor.Medium.TerminationReason>({ _tag: 'Abnormal', report: unreportedExit }),
  probe: () => Effect.succeed(true),
  stop: () => Effect.die(new Error('the child had no way to be stopped')),
})

const unlatchableChild: Layer.Layer<Supervisor.Medium.MediumPortShape<ChildTask, never, Scope.Scope>> = Layer.succeed(
  LatchPort,
  { medium: undyingMedium },
)

const reasonTagOf = (reason: Supervisor.Medium.TerminationReason): string =>
  Match.value(reason).pipe(
    Match.tag('Normal', () => 'Normal'),
    Match.tag('Shutdown', () => 'Shutdown'),
    Match.tag('Abnormal', () => 'Abnormal'),
    Match.exhaustive,
  )

const latchTagOf = (exit: Exit.Exit<void, Supervisor.SupervisorTerminated>): string | undefined =>
  Exit.match(exit, {
    onSuccess: () => undefined,
    onFailure: (cause) =>
      Option.getOrUndefined(Option.map(Cause.findErrorOption(cause), (error) => reasonTagOf(error.reason))),
  })

const decidedTagOf = (supervisor: Supervisor.RunningSupervisor): Effect.Effect<string | undefined> =>
  Effect.map(Supervisor.statusOf(supervisor), (state) =>
    Match.value(state).pipe(
      Match.tag('Terminated', (terminated) => reasonTagOf(terminated.reason)),
      Match.tag('ShuttingDown', (shutting) => reasonTagOf(shutting.reason)),
      Match.orElse(() => undefined),
    ))

const givingUpSession = Effect.gen(function*() {
  const supervisor = yield* Supervisor.make('giving-up').pipe(
    Supervisor.intensity(0, 5_000),
    Supervisor.children([Supervisor.ChildSpecs.on(LatchPort)('child', Effect.never)]),
  ).scoped
  const waiting = yield* Effect.forkScoped(Effect.exit(Supervisor.awaitTerminated(supervisor)))
  const exit = yield* Fiber.join(waiting)
  return { latch: latchTagOf(exit), decided: yield* decidedTagOf(supervisor) }
})

Feature('Reporting why a supervision tree stopped')
  .withLayer(unlatchableChild)
  .body(({ scenario }) => {
    scenario(
      'A waiter is told why the supervisor stopped when stopping its child fails',
      Gherkin.Do.pipe(
        Given('a supervisor that gives up when its child reports an abnormal exit')(
          'session',
          () => Effect.succeed(givingUpSession),
        ),
        When('that child is stopped and the stop fails')('reasons', (s) => s.session),
        Then('the waiter is told the reason the supervisor gave up, not that it shut down cleanly')(
          ({ reasons }, expect) => expect(reasons).toEqual({ latch: 'Abnormal', decided: 'Abnormal' }),
        ),
      ),
    )
  })
