import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as Layer from 'effect/Layer'
import { assertionOf, type ConsoleLine, runProbes } from './__fixtures__/run-fixtures'

const Feature = makeFeature({ it })

const loggedErrors = (lines: ReadonlyArray<ConsoleLine>): ReadonlyArray<string> =>
  lines
    .flatMap((line) => line.content.split('\n'))
    .filter((text) => text.includes('ERROR (#'))

Feature('Fork failure logging')
  .live(
    'each scenario starts a nested Vitest run over probe fixtures, so the console the runner logged to survives the run',
  )
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'a program that fails with one error logs nothing before the runner throws it',
      Gherkin.Do.pipe(
        Given('a probe whose only check mismatches')(
          'run',
          () => runProbes({ globs: ['runner/failure-single.test.ts'] }),
        ),
        When('the nested run reports its failure')(
          'failure',
          (s) => Effect.succeed(assertionOf(s.run.report, 'Should_FailWithOneError_When_ItsOnlyCheckMismatches')),
        ),
        Then('the console holds no error and the failure is reported once')((s, expect) =>
          expect({
            status: s.failure.status,
            logged: loggedErrors(s.run.console),
            reported: s.failure.failureMessages,
          }).toMatchObject({
            status: 'failed',
            logged: [],
            reported: [expect.stringContaining('solo-expected')],
          })
        ),
      ),
    )

    scenario(
      'a program that fails with two errors logs the one the runner does not throw',
      Gherkin.Do.pipe(
        Given('a probe whose check mismatches and whose cleanup fails')(
          'run',
          () => runProbes({ globs: ['runner/failure-many.test.ts'] }),
        ),
        When('the nested run reports its failure')(
          'failure',
          (s) =>
            Effect.succeed(
              assertionOf(s.run.report, 'Should_FailWithTwoErrors_When_ItsCheckMismatchesAndItsCleanupFails'),
            ),
        ),
        Then('the console holds the unthrown error alone and the report names the thrown one')((s, expect) => {
          const reported = s.failure.failureMessages.join('\n')
          return expect({
            status: s.failure.status,
            logged: loggedErrors(s.run.console),
            reported: reported,
            reportedOmitsTheLogged: reported,
          }).toMatchObject({
            status: 'failed',
            logged: [expect.stringContaining('unthrown-marker')],
            reported: expect.stringContaining('kept-expected'),
            reportedOmitsTheLogged: expect.not.stringMatching(/unthrown-marker/),
          })
        }),
      ),
    )

    scenario(
      'a program whose defect comes before its error logs the defect and throws the error, each once',
      Gherkin.Do.pipe(
        Given('a probe that dies and then fails, in that order')(
          'run',
          () => runProbes({ globs: ['runner/failure-die-then-fail.test.ts'] }),
        ),
        When('the nested run reports its failure')(
          'failure',
          (s) =>
            Effect.succeed(
              assertionOf(s.run.report, 'Should_FailWithADefectThenAnError_When_ItsCauseHoldsBothInThatOrder'),
            ),
        ),
        Then('the console holds the defect alone and the report names the error')((s, expect) => {
          const reported = s.failure.failureMessages.join('\n')
          return expect({
            status: s.failure.status,
            logged: loggedErrors(s.run.console),
            reported: reported,
            reportedOmitsTheLogged: reported,
          }).toMatchObject({
            status: 'failed',
            logged: [expect.stringContaining('died-first-marker')],
            reported: expect.stringContaining('failed-second-marker'),
            reportedOmitsTheLogged: expect.not.stringMatching(/died-first-marker/),
          })
        }),
      ),
    )
  })
