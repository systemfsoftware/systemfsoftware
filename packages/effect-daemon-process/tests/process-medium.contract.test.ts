import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Exit, Layer, Scope } from 'effect'
import { ChildProcess } from 'effect/unstable/process'
import {
  abnormalTerminationsIn,
  awaitProcessGone,
  causesClaimedIn,
  exitReportsIn,
  mediumLayer,
  readyChildIdsIn,
  spawnerLayer,
  startDeadlineChildIdsIn,
  startedChildIdsIn,
} from './__fixtures__/process-fixtures.js'
import {
  brutalStop,
  gracefulStop,
  infinityStop,
  ownedChild,
  programRun,
  scriptedRun,
} from './__fixtures__/process-runs.js'

const Feature = makeFeature({ it })

const MISSING_EXECUTABLE = 'effect-daemon-process-no-such-executable'

const STOP_WINDOW_MILLIS = 300

const SCRIPT_TIMEOUT_MILLIS = 2_000

Feature('Supervising an operating-system process', { timeout: 120_000 })
  .withLayer(Layer.merge(mediumLayer, spawnerLayer))
  .live('every scenario spawns, signals and reaps real operating-system child processes')
  .body(({ background, scenario }) => {
    background(
      Gherkin.Do.pipe(
        Given('a process medium bound to a real child-process spawner')(() => Effect.void),
      ),
    )

    scenario(
      'A program killed by a signal is reported with that signal and nothing else',
      Gherkin.Do.pipe(
        Given('a program scripted to report readiness and then die from a signal')(
          'script',
          () => Effect.succeed([{ _tag: 'BecomeReady' }, { _tag: 'ExitAbnormal' }] as const),
        ),
        When('a supervisor runs it to termination')(
          'trace',
          (s) =>
            scriptedRun({
              name: 'signal',
              childId: 'worker',
              steps: s.script,
              options: { restartType: 'transient', startTimeoutMillis: SCRIPT_TIMEOUT_MILLIS },
            }),
        ),
        Then(
          'the medium reports the signal that ended it and no termination claims a cause it cannot supply',
        )((s, expect) =>
          expect({
            reports: exitReportsIn(s.trace).map((report) => ({ signal: report.signal, code: report.code })),
            causesClaimed: causesClaimedIn(s.trace),
          }).toEqual({ reports: [{ signal: 'SIGKILL', code: 0 }], causesClaimed: 0 })
        ),
      ),
    )

    scenario(
      'A program that never reports readiness misses its start deadline',
      Gherkin.Do.pipe(
        Given('a program scripted never to report readiness')(
          'script',
          () => Effect.succeed([{ _tag: 'NeverBecomeReady' }] as const),
        ),
        When('a supervisor runs it')(
          'trace',
          (s) =>
            scriptedRun({
              name: 'unready',
              childId: 'worker',
              steps: s.script,
              options: { startTimeoutMillis: 100 },
            }),
        ),
        Then('the program is started, never counted as ready, and its start deadline elapses')((s, expect) =>
          expect({
            started: startedChildIdsIn(s.trace),
            ready: readyChildIdsIn(s.trace),
            deadline: startDeadlineChildIdsIn(s.trace),
          }).toEqual({ started: ['worker'], ready: [], deadline: ['worker'] })
        ),
      ),
    )

    scenario(
      'A program that ignores a graceful stop is ended at once when the stop is brutal',
      Gherkin.Do.pipe(
        When('it is stopped at once')('observation', () => brutalStop('brutal')),
        Then('it is gone and was never signalled gracefully')((s, expect) =>
          expect({ ...s.observation }).toEqual({ stopIgnored: true, signals: ['IGNORE'], goneAfterStop: true })
        ),
      ),
    )

    scenario(
      'A program that ignores a graceful stop is forced when its window elapses',
      Gherkin.Do.pipe(
        When('it is stopped with a window')(
          'observation',
          () => gracefulStop({ name: 'graceful', millis: STOP_WINDOW_MILLIS }),
        ),
        Then('it is gone, having survived the graceful signal until the window elapsed')((s, expect) =>
          expect({ ...s.observation }).toEqual({ stopIgnored: true, signals: ['IGNORE', 'TERM'], goneAfterStop: true })
        ),
      ),
    )

    scenario(
      'A program that ignores a graceful stop is left alone when the stop has no window',
      Gherkin.Do.pipe(
        When('it is stopped with no window')('observation', () => infinityStop('infinity')),
        Then('it survives the graceful signal while the stop keeps waiting')((s, expect) =>
          expect({ ...s.observation }).toEqual({ gracefulSignalSeen: true, stillWaiting: true, stillRunning: true })
        ),
      ),
    )

    scenario(
      'A program that cannot be started ends the supervision abnormally',
      Gherkin.Do.pipe(
        When('a supervisor runs a program naming an executable that does not exist')(
          'trace',
          () =>
            programRun({
              name: 'missing',
              childId: 'worker',
              program: ChildProcess.make(MISSING_EXECUTABLE, []),
              options: { restartType: 'transient' },
            }),
        ),
        Then('the medium never claims the program started and the child is reported terminated abnormally')(
          (s, expect) =>
            expect({ started: startedChildIdsIn(s.trace), abnormal: abnormalTerminationsIn(s.trace) }).toEqual({
              started: [],
              abnormal: 1,
            }),
        ),
      ),
    )

    scenario(
      'No process outlives the scope that owned it',
      Gherkin.Do.pipe(
        Given('a supervisor owning one long-running program')(
          'owned',
          () => ownedChild({ name: 'leak', childId: 'worker' }),
        ),
        And('that program is running')((s, expect) =>
          expect({ wasRunning: s.owned.wasRunning }).toEqual({ wasRunning: true })
        ),
        When("that supervisor's scope closes")((s) => Scope.close(s.owned.scope, Exit.void)),
        Then('no process it started is still running')((s, expect) =>
          Effect.map(awaitProcessGone(s.owned.pid), (gone) => expect({ gone }).toEqual({ gone: true }))
        ),
      ),
    )
  })
