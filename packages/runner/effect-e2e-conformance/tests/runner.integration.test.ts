import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Layer from 'effect/Layer'

import { runSuite, type SuiteRun } from './__fixtures__/runner-suite.fixture.js'

const Feature = makeFeature({ it })

const statusesOf = (run: SuiteRun) => Object.fromEntries(run.tests.map((test) => [test.title, test.status]))

const e2eStatusesOf = (run: SuiteRun) => Object.fromEntries(run.partials.map((test) => [test.title, test.status]))

const LOCATOR_TEST = 'Should_Fail_When_TheStatusNeverReadsPro'
const VALUE_TEST = 'Should_FailThroughVitest_When_TwoValuesDiffer'
const ASSERTION_TIMEOUT_MS = 400

const failureOf = (run: SuiteRun, title: string) =>
  run.tests.find((test) => test.title === title) ?? { failure: '', durationMs: 0 }

Feature('Running a suite under vitest run with the e2e runner')
  .live('each scenario spawns a nested vitest run process and waits for it to exit')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A test body receives its fixtures, opens the app once, and the run exits 0',
      Gherkin.Do.pipe(
        When('the suite runs the test that uses app, agent, screen and platform')(
          'run',
          () => runSuite({ config: 'vitest.config.ts', files: ['tests/fixtures.e2e.ts'] }),
        ),
        Then('Vitest and the e2e report both pass it, and one engine was opened')((s, expect) =>
          expect({
            exitCode: s.run.exitCode,
            vitest: statusesOf(s.run),
            e2e: e2eStatusesOf(s.run),
            opens: s.run.engineOpens,
          })
            .toEqual({
              exitCode: 0,
              vitest: { Should_ReceiveAppAgentScreenAndPlatform_When_TheE2eRunnerIsSelected: 'passed' },
              e2e: { Should_ReceiveAppAgentScreenAndPlatform_When_TheE2eRunnerIsSelected: 'passed' },
              opens: 1,
            })
        ),
      ),
    )

    scenario(
      'A test that never touches the screen opens no engine, and an iOS-only test is skipped on the web target',
      Gherkin.Do.pipe(
        When('the suite runs a screenless test beside a test declared for iOS only')(
          'run',
          () => runSuite({ config: 'vitest.config.ts', files: ['tests/no-engine.e2e.ts'] }),
        ),
        Then('no engine is opened, the iOS-only test is skipped in both reports, and the run exits 0')((s, expect) =>
          expect({
            exitCode: s.run.exitCode,
            vitest: statusesOf(s.run),
            e2e: e2eStatusesOf(s.run),
            opens: s.run.engineOpens,
          })
            .toEqual({
              exitCode: 0,
              vitest: {
                Should_Pass_When_TheScreenIsNeverTouched: 'passed',
                Should_BeSkipped_When_TheTargetRunsOnWeb: 'skipped',
              },
              e2e: {
                Should_Pass_When_TheScreenIsNeverTouched: 'passed',
                Should_BeSkipped_When_TheTargetRunsOnWeb: 'skipped',
              },
              opens: 0,
            })
        ),
      ),
    )

    scenario(
      'A locator assertion retries to its deadline and fails with the last value, while a value assertion fails through Vitest',
      Gherkin.Do.pipe(
        When('the suite runs a locator assertion that never holds and a value assertion that does not hold')(
          'run',
          () => runSuite({ config: 'vitest.config.ts', files: ['tests/failing.e2e.ts'] }),
        ),
        Then('both fail, the locator failure names the query, the expected and the last value, and the run exits 1')((
          s,
          expect,
        ) =>
          expect({
            exitCode: s.run.exitCode,
            vitest: statusesOf(s.run),
            e2e: e2eStatusesOf(s.run),
            locator: {
              retriedToDeadline: failureOf(s.run, LOCATOR_TEST).durationMs >= ASSERTION_TIMEOUT_MS,
              namesQuery: failureOf(s.run, LOCATOR_TEST).failure.includes('getByRole(status)'),
              namesExpected: failureOf(s.run, LOCATOR_TEST).failure.includes('"Pro"'),
              namesLastValue: failureOf(s.run, LOCATOR_TEST).failure.includes("'Free plan'"),
            },
            value: failureOf(s.run, VALUE_TEST).failure,
          }).toEqual({
            exitCode: 1,
            vitest: { [LOCATOR_TEST]: 'failed', [VALUE_TEST]: 'failed' },
            e2e: { [LOCATOR_TEST]: 'failed', [VALUE_TEST]: 'failed' },
            locator: { retriedToDeadline: true, namesQuery: true, namesExpected: true, namesLastValue: true },
            value: 'AssertionError: expected 2 to be 3 // Object.is equality',
          })
        ),
      ),
    )

    scenario(
      'A config that does not decode fails every test with CONFIG_INVALID, opens no engine, and the run exits 2',
      Gherkin.Do.pipe(
        When('the suite runs every test with the runner over a config whose project id is empty')(
          'run',
          () => runSuite({ config: 'vitest.refused.config.ts', files: [] }),
        ),
        Then('every test fails naming the refused key, no engine or report partial exists, and the run exits 2')((
          s,
          expect,
        ) =>
          expect({
            exitCode: s.run.exitCode,
            failures: [...new Set(s.run.tests.map((test) => `${test.status}: ${test.failure}`))],
            tests: s.run.tests.length,
            opens: s.run.engineOpens,
            partials: s.run.partials,
          }).toEqual({
            exitCode: 2,
            failures: ['failed: config projectId: a project id is between 1 and 256 characters'],
            tests: 5,
            opens: 0,
            partials: [],
          })
        ),
      ),
    )
  })
