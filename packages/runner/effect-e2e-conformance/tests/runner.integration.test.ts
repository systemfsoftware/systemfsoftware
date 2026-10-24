import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import { type MergedReport, runSuite, type SuiteRun } from './__fixtures__/runner-suite.fixture.js'

const Feature = makeFeature({ it })

const statusesOf = (run: SuiteRun) => Object.fromEntries(run.tests.map((test) => [test.title, test.status]))

const reportedOf = (report: MergedReport) => Object.fromEntries(report.tests.map((test) => [test.title, test.status]))

const e2eStatusesOf = (run: SuiteRun) => Option.getOrNull(Option.map(run.report, reportedOf))

const mergedOf = (run: SuiteRun) =>
  Option.getOrNull(Option.map(run.report, (report) => ({
    run: [report.status, report.exitCode],
    errors: report.errors,
    tests: reportedOf(report),
  })))

const partialRunsOf = (run: SuiteRun) =>
  run.partials.map((partial) => ({
    ofTheReportedRun: Option.exists(run.report, (report) => report.runId === partial.runId),
    titles: partial.titles,
  }))

const reportRunIdOf = (run: SuiteRun) => Option.getOrElse(Option.map(run.report, (report) => report.runId), () => '')

const LOCATOR_TEST = 'Should_Fail_When_TheStatusNeverReadsPro'
const VALUE_TEST = 'Should_FailThroughVitest_When_TwoValuesDiffer'
const ASSERTION_TIMEOUT_MS = 400

const WORKER_FILES = ['tests/worker-a.e2e.ts', 'tests/worker-b.e2e.ts']
const T16_FILES = ['tests/fixtures.e2e.ts', 'tests/no-engine.e2e.ts', 'tests/retry.e2e.ts', 'tests/failing.e2e.ts']

const A_READS_FREE = 'Should_ReadTheFreePlan_When_WorkerAOpensBilling'
const A_PASSES = 'Should_Pass_When_WorkerAChecksAValue'
const B_PASSES = 'Should_Pass_When_WorkerBChecksAValue'
const B_FAILS = 'Should_Fail_When_WorkerBExpectsAWrongSum'
const TWO_WORKER_STATUSES = {
  [A_READS_FREE]: 'passed',
  [A_PASSES]: 'passed',
  [B_PASSES]: 'passed',
  [B_FAILS]: 'failed',
}

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
      'A test that fails its first try and passes its retry passes, and the run exits 0',
      Gherkin.Do.pipe(
        When('the suite runs a test with one retry whose first try fails a value assertion')(
          'run',
          () => runSuite({ config: 'vitest.config.ts', files: ['tests/retry.e2e.ts'] }),
        ),
        Then('Vitest and the e2e report both pass it on its final try, and the run exits 0')((s, expect) =>
          expect({ exitCode: s.run.exitCode, vitest: statusesOf(s.run), e2e: e2eStatusesOf(s.run) }).toEqual({
            exitCode: 0,
            vitest: { Should_Pass_When_TheRetryHolds: 'passed' },
            e2e: { Should_Pass_When_TheRetryHolds: 'passed' },
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
        When('the suite runs its tests with the runner over a config whose project id is empty')(
          'run',
          () => runSuite({ config: 'vitest.refused.config.ts', files: T16_FILES }),
        ),
        Then('every test fails naming the refused key, no engine, partial or report exists, and the run exits 2')((
          s,
          expect,
        ) =>
          expect({
            exitCode: s.run.exitCode,
            failures: [...new Set(s.run.tests.map((test) => `${test.status}: ${test.failure}`))],
            tests: s.run.tests.length,
            opens: s.run.engineOpens,
            partials: s.run.partials,
            report: mergedOf(s.run),
          }).toEqual({
            exitCode: 2,
            failures: ['failed: config projectId: a project id is between 1 and 256 characters'],
            tests: 6,
            opens: 0,
            partials: [],
            report: null,
          })
        ),
      ),
    )

    scenario(
      'Two test files run in two workers and leave one report holding each result once',
      Gherkin.Do.pipe(
        When("the suite runs worker A's and worker B's test files in two workers")(
          'run',
          () => runSuite({ config: 'vitest.config.ts', files: WORKER_FILES }),
        ),
        Then(
          'two partials of the reported run hold disjoint results, report.json holds all four once, and the run failed',
        )((
          s,
          expect,
        ) =>
          expect({
            exitCode: s.run.exitCode,
            vitest: statusesOf(s.run),
            runIdNamesProject: reportRunIdOf(s.run).startsWith('runner-suite-'),
            partials: partialRunsOf(s.run),
            report: mergedOf(s.run),
          }).toEqual({
            exitCode: 1,
            vitest: TWO_WORKER_STATUSES,
            runIdNamesProject: true,
            partials: [
              { ofTheReportedRun: true, titles: [B_FAILS, B_PASSES] },
              { ofTheReportedRun: true, titles: [A_PASSES, A_READS_FREE] },
            ],
            report: { run: ['failed', 1], errors: [], tests: TWO_WORKER_STATUSES },
          })
        ),
      ),
    )

    scenario(
      "A previous run's partial and report are cleared before the run, so neither reaches the new report",
      Gherkin.Do.pipe(
        When("the suite output still holds a previous run's partial and report, and the two worker files run")(
          'run',
          () => runSuite({ config: 'vitest.config.ts', files: WORKER_FILES, stale: true }),
        ),
        Then("only this run's two partials remain, and report.json holds only this run's four results")((s, expect) =>
          expect({
            partials: partialRunsOf(s.run).map((partial) => partial.ofTheReportedRun),
            previousRun: reportRunIdOf(s.run) === 'runner-suite-previous-run',
            report: e2eStatusesOf(s.run),
          }).toEqual({ partials: [true, true], previousRun: false, report: TWO_WORKER_STATUSES })
        ),
      ),
    )

    scenario(
      'A worker that dies mid-file leaves a readable report with its finished results and an error run status',
      Gherkin.Do.pipe(
        When('the suite runs a file whose second test kills its own worker after the first test passed')(
          'run',
          () => runSuite({ config: 'vitest.config.ts', files: ['tests/crash.e2e.ts'] }),
        ),
        Then('report.json holds the passed test, one INTERNAL_ERROR, run status error with exit code 4')((
          s,
          expect,
        ) =>
          expect({ exitCode: s.run.exitCode, report: mergedOf(s.run) }).toEqual({
            exitCode: 1,
            report: {
              run: ['error', 4],
              errors: ['INTERNAL_ERROR'],
              tests: { Should_Pass_When_ItRunsBeforeTheWorkerDies: 'passed' },
            },
          })
        ),
      ),
    )

    scenario(
      "A worker that dies while collecting its file turns the run's report to error beside the other worker's results",
      Gherkin.Do.pipe(
        When("the suite runs worker A's file beside a file that kills its own worker while it is being collected")(
          'run',
          () =>
            runSuite({ config: 'vitest.config.ts', files: ['tests/worker-a.e2e.ts', 'tests/collect-crash.e2e.ts'] }),
        ),
        Then("report.json holds worker A's two passed tests, one INTERNAL_ERROR, run status error with exit code 4")((
          s,
          expect,
        ) =>
          expect({ exitCode: s.run.exitCode, report: mergedOf(s.run) }).toEqual({
            exitCode: 1,
            report: {
              run: ['error', 4],
              errors: ['INTERNAL_ERROR'],
              tests: { [A_READS_FREE]: 'passed', [A_PASSES]: 'passed' },
            },
          })
        ),
      ),
    )
  })
