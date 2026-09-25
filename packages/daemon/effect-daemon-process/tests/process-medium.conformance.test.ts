import { Conformance } from '@systemfsoftware/conformance-spec'
import { Conformance as Medium } from '@systemfsoftware/effect-daemon-conformance'
import { ProcessMedium } from '@systemfsoftware/effect-daemon-process'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Duration, Effect, Layer, Match, Option, Schema } from 'effect'
import type { Scope } from 'effect'
import type * as PlatformError from 'effect/PlatformError'
import type { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process'
import { fixturePath } from './__fixtures__/process-fixtures.js'
import {
  ChildReportedOtherThanShutdown,
  ChildWasReadyBeforeItSaidSo,
  nothingLeftRunning,
  ProcessLedger,
  scriptedSpawner,
  StoppedWithAnUnexpectedSignal,
} from './__fixtures__/scripted-spawner.fixture.js'

const Feature = makeFeature({ it })

type Project =
  | Supervisor.Medium.MediumPortShape<
    ChildProcess.Command,
    PlatformError.PlatformError,
    Scope.Scope | ChildProcessSpawner.ChildProcessSpawner
  >
  | ChildProcessSpawner.ChildProcessSpawner

const FORCED = 'SIGKILL'

const SETTLE_MILLIS = 1

const becomeReady: Medium.ChildStep = { _tag: 'BecomeReady' }

/** How many incarnations the run's spawner started, read from the run's own ledger. */
const startedChildrenIn: Effect.Effect<number, never, ProcessLedger> = Effect.flatMap(
  Effect.service(ProcessLedger),
  (ledger) => ledger.started,
)

const driver = ProcessMedium.conformanceDriver({ fixturePath })

type Violations = PlatformError.PlatformError | ChildReportedOtherThanShutdown | StoppedWithAnUnexpectedSignal

type AnnouncingViolations = Violations | ChildWasReadyBeforeItSaidSo

/** The stop answers the shutdown its latch promises, and the operating system's own signal reaches the child. */
const stoppedAsDeclared: Effect.Effect<
  void,
  ChildReportedOtherThanShutdown | StoppedWithAnUnexpectedSignal,
  ProcessLedger
> = Effect.gen(function*() {
  const ledger = yield* Effect.service(ProcessLedger)
  const signals = yield* ledger.signalsToLast
  yield* Arr.contains(signals, FORCED)
    ? Effect.void
    : Effect.fail(new StoppedWithAnUnexpectedSignal({ sent: signals, expected: FORCED }))
})

const shutdownReasonOf = (reason: Supervisor.Medium.TerminationReason): Effect.Effect<void, Violations> =>
  Match.value(reason).pipe(
    Match.tag('Shutdown', () => Effect.void),
    Match.tag('Normal', () => Effect.fail(new ChildReportedOtherThanShutdown({ observed: 'Normal' }))),
    Match.tag('Abnormal', () => Effect.fail(new ChildReportedOtherThanShutdown({ observed: 'Abnormal' }))),
    Match.exhaustive,
  )

/**
 * One supervised incarnation of a child that never announces itself: the step is offered before the
 * incarnation claims its channel, and the stop lands while the child is still running.
 */
const superviseUnannouncedChild: Effect.Effect<
  void,
  Violations,
  Project | ProcessLedger | Scope.Scope
> = Effect.gen(function*() {
  const launched = yield* driver.launch('worker', [])
  yield* launched.control.advance(becomeReady, 0)
  const { medium } = yield* ProcessMedium.port
  const evidence = yield* medium.start(launched.program)
  yield* evidence.ready
  yield* medium.stop(evidence, { _tag: 'Brutal' })
  yield* shutdownReasonOf(yield* medium.report(evidence))
  yield* stoppedAsDeclared
})

/**
 * One supervised incarnation of a child that announces its readiness over its own standard output:
 * the medium must not answer ready before the child has said so, and the step reaches the
 * incarnation once it has claimed its channel.
 */
const superviseAnnouncingChild: Effect.Effect<
  void,
  AnnouncingViolations,
  Project | ProcessLedger | Scope.Scope
> = Effect.gen(function*() {
  const launched = yield* driver.launch('worker', [])
  const { medium } = yield* ProcessMedium.port
  const evidence = yield* medium.start(launched.program)
  const early = yield* Effect.timeoutOption(evidence.ready, Duration.millis(SETTLE_MILLIS))
  yield* Option.match(early, {
    onNone: () => Effect.void,
    onSome: () => Effect.fail(new ChildWasReadyBeforeItSaidSo()),
  })
  yield* launched.control.advance(becomeReady, 0)
  yield* evidence.ready
  yield* medium.stop(evidence, { _tag: 'Brutal' })
  yield* shutdownReasonOf(yield* medium.report(evidence))
  yield* stoppedAsDeclared
})

const liveReason =
  'each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run'

Feature('Supervising a child process until the scope that owns it closes', { timeout: 120_000 })
  .live(liveReason)
  .body(({ scenario }) => {
    scenario(
      'A child that never announces itself is gone once the supervision is stopped at any step',
      Gherkin.Do.pipe(
        Given('a process medium bound to a scripted child-process spawner')(
          'environment',
          () => Layer.build(Layer.merge(ProcessMedium.layer(), scriptedSpawner)),
        ),
        When('a child is supervised and the supervision is stopped at every step')(
          'checked',
          (s) =>
            Conformance.released(Effect.provide(superviseUnannouncedChild, s.environment), {
              probe: Effect.provide(nothingLeftRunning, s.environment),
            }),
        ),
        Then('no child is left running and every stop was the shutdown it promised')((s, expect) =>
          Effect.provide(startedChildrenIn, s.environment).pipe(
            Effect.map((started) =>
              expect({ report: s.checked, started }, Conformance.render(s.checked)).toMatchObject({
                report: { _tag: 'Pass' },
                started: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
              })
            ),
          )
        ),
      ),
    )

    scenario(
      'A child that announces itself is reported ready only after it has said so, and is gone once stopped',
      Gherkin.Do.pipe(
        Given('a process medium bound to a scripted child-process spawner that reads the ready line')(
          'environment',
          () =>
            Layer.build(
              Layer.merge(ProcessMedium.layer({ readyLine: ProcessMedium.fixtureReadyLine }), scriptedSpawner),
            ),
        ),
        When('a child that announces itself is supervised and the supervision is stopped at every step')(
          'checked',
          (s) =>
            Conformance.released(Effect.provide(superviseAnnouncingChild, s.environment), {
              probe: Effect.provide(nothingLeftRunning, s.environment),
            }),
        ),
        Then('readiness waited for the child and no child is left running')((s, expect) =>
          Effect.provide(startedChildrenIn, s.environment).pipe(
            Effect.map((started) =>
              expect({ report: s.checked, started }, Conformance.render(s.checked)).toMatchObject({
                report: { _tag: 'Pass' },
                started: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
              })
            ),
          )
        ),
      ),
    )
  })
