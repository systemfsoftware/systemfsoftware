import * as NodeServices from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import {
  AiTraceFile,
  aiTracesIn,
  copiedRunnerSuite,
  runCli,
  runIdOf,
  runVitestJson,
  STALE_REPORT,
  staleReportIn,
  statusesOf,
  vitestConfigRemovedFrom,
} from './__fixtures__/cli-run.fixture.js'
import { PLANTED_SECRET } from './__fixtures__/runner-suite/site.js'

const Feature = makeFeature({ it })

const FIXTURES_TEST = 'Should_ReceiveAppAgentScreenAndPlatform_When_TheE2eRunnerIsSelected'
const LOCATOR_TEST = 'Should_Fail_When_TheStatusNeverReadsPro'
const VALUE_TEST = 'Should_FailThroughVitest_When_TwoValuesDiffer'
const MODEL_CALL_FILE = 'tests/model-call.e2e.ts'
const MODEL_CALL_TEST = 'Should_FailOnTheModel_When_TheAgentActsWithThePlantedSecret'
const ESCAPED_SECRET = JSON.stringify(PLANTED_SECRET).slice(1, -1)

const tracedRun = (suite: string, args: ReadonlyArray<string>) =>
  Effect.gen(function*() {
    const cli = yield* runCli({ suite, args })
    const traces = yield* aiTracesIn(suite)
    const firstCall = yield* Option.match(Option.fromNullishOr(traces[0]), {
      onNone: () => Effect.succeed(null),
      onSome: ({ text }) =>
        Effect.map(Effect.orDie(Schema.decodeEffect(AiTraceFile)(text)), ({ calls }) => calls[0] ?? null),
    })
    return { cli, traces, firstCall }
  })

const WORKER_FILES = ['tests/worker-a.e2e.ts', 'tests/worker-b.e2e.ts']
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

const ranStatusesOf = (statuses: Readonly<Record<string, string>>) =>
  Object.fromEntries(Object.entries(statuses).filter(([, status]) => status !== 'skipped'))

Feature('Running a suite with effect-e2e run')
  .withLayer(Layer.empty)
  .live('each scenario copies the memory-engine suite to a scratch root and runs the linked bin over it')
  .body(({ scenario }) => {
    scenario(
      'A suite whose tests pass exits 0, leaves the merged report, and prints the summary',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a copy of the suite with its valid config')('suite', () => copiedRunnerSuite('valid')),
        When('the run selects the test that uses every fixture')(
          'run',
          ({ suite }) => runCli({ suite, args: ['tests/fixtures.e2e.ts'] }),
        ),
        Then('the run exits 0, the report holds the test as passed, and the summary names it')((s, expect) =>
          expect({
            exitCode: s.run.exitCode,
            report: statusesOf(s.run.report),
            summaryNamesTheTest: s.run.stdout.includes(FIXTURES_TEST),
          }).toEqual({ exitCode: 0, report: { [FIXTURES_TEST]: 'passed' }, summaryNamesTheTest: true })
        ),
      ),
    )

    scenario(
      'A failing test ends the run with exit 1',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a copy of the suite with its valid config')('suite', () => copiedRunnerSuite('valid')),
        When('the run selects the file whose two tests fail')(
          'run',
          ({ suite }) => runCli({ suite, args: ['tests/failing.e2e.ts'] }),
        ),
        Then('the run exits 1 and the report holds both tests as failed')((s, expect) =>
          expect({ exitCode: s.run.exitCode, report: statusesOf(s.run.report) }).toEqual({
            exitCode: 1,
            report: { [LOCATOR_TEST]: 'failed', [VALUE_TEST]: 'failed' },
          })
        ),
      ),
    )

    scenario(
      'A config the runner refuses exits 2 naming the refused key, and an older report is neither read nor printed',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a copy of the suite whose config has an empty project id')('suite', () => copiedRunnerSuite('refused')),
        Given('an older report left in the output')('planted', ({ suite }) => staleReportIn(suite)),
        When('the run selects the file whose test uses every fixture')(
          'run',
          ({ suite }) => runCli({ suite, args: ['tests/fixtures.e2e.ts'] }),
        ),
        Then('the run exits 2, names the project id, prints nothing, and leaves the older report untouched')((
          s,
          expect,
        ) =>
          expect({
            exitCode: s.run.exitCode,
            namesTheKey: s.run.stderr.includes('projectId'),
            stdout: s.run.stdout,
            left: Option.getOrNull(s.run.reportText),
          }).toEqual({ exitCode: 2, namesTheKey: true, stdout: '', left: STALE_REPORT })
        ),
      ),
    )

    scenario(
      'A run started inside the suite without --dir finds the suite root',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a copy of the suite with its valid config')('suite', () => copiedRunnerSuite('valid')),
        When('the run starts in the suite tests directory and selects the test that uses every fixture')(
          'run',
          ({ suite }) => runCli({ suite, withoutDirFrom: 'tests', args: ['tests/fixtures.e2e.ts'] }),
        ),
        Then('the run exits 0 and the report at the suite root holds the test as passed')((s, expect) =>
          expect({ exitCode: s.run.exitCode, report: statusesOf(s.run.report) }).toEqual({
            exitCode: 0,
            report: { [FIXTURES_TEST]: 'passed' },
          })
        ),
      ),
    )

    scenario(
      'A run started outside any suite without --dir exits 2 and runs nothing',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a copy of the suite with its valid config')('suite', () => copiedRunnerSuite('valid')),
        When('the run starts in the directory holding the suite, where no suite config lies at or above')(
          'run',
          ({ suite }) => runCli({ suite, withoutDirFrom: '..', args: [] }),
        ),
        Then('the run exits 2, says no suite config was found, and the suite holds no report')((s, expect) =>
          expect({
            exitCode: s.run.exitCode,
            saysNoSuite: s.run.stderr.includes('no e2e.config.ts at or above'),
            report: Option.getOrNull(s.run.reportText),
          }).toEqual({ exitCode: 2, saysNoSuite: true, report: null })
        ),
      ),
    )

    scenario(
      'A --dir naming a directory without vitest.config.ts exits 2 naming the missing file',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a copy of the suite with its valid config')('suite', () => copiedRunnerSuite('valid')),
        Given('the copy has lost its vitest.config.ts')('removed', ({ suite }) => vitestConfigRemovedFrom(suite)),
        When('the run names the copy with --dir')('run', ({ suite }) => runCli({ suite, args: [] })),
        Then('the run exits 2, names vitest.config.ts, and the suite holds no report')((s, expect) =>
          expect({
            exitCode: s.run.exitCode,
            namesTheFile: s.run.stderr.includes('holds no vitest.config.ts'),
            report: Option.getOrNull(s.run.reportText),
          }).toEqual({ exitCode: 2, namesTheFile: true, report: null })
        ),
      ),
    )

    scenario(
      "The run's JSON report and vitest run's JSON report agree on every test's outcome",
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a copy of the suite with its valid config')('suite', () => copiedRunnerSuite('valid')),
        When('vitest run reports the two worker files as JSON')(
          'vitest',
          ({ suite }) => runVitestJson({ suite, files: WORKER_FILES }),
        ),
        When('effect-e2e run reports the same two files as JSON')(
          'run',
          ({ suite }) => runCli({ suite, args: ['--reporter', 'json', ...WORKER_FILES] }),
        ),
        Then(
          'both name the same four tests with the same outcomes, the printed report is the merged one, and the run exits 1',
        )((s, expect) =>
          expect({
            exitCode: s.run.exitCode,
            vitest: s.vitest,
            printed: statusesOf(s.run.printed),
            printedIsMerged: runIdOf(s.run.printed) === runIdOf(s.run.report),
          }).toEqual({ exitCode: 1, vitest: TWO_WORKER_STATUSES, printed: TWO_WORKER_STATUSES, printedIsMerged: true })
        ),
      ),
    )

    scenario(
      'Both worker files run under one worker slot and each isolated worker leaves its partial',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a copy of the suite with its valid config, which runs two workers')(
          'suite',
          () => copiedRunnerSuite('valid'),
        ),
        When('the run selects both worker files with one worker slot')(
          'run',
          ({ suite }) => runCli({ suite, args: ['--workers', '1', ...WORKER_FILES] }),
        ),
        Then('both isolated workers left their partial of one run, and the run exits 1 for the failing sum')((
          s,
          expect,
        ) => expect({ exitCode: s.run.exitCode, partials: s.run.partials }).toEqual({ exitCode: 1, partials: 2 })),
      ),
    )

    scenario(
      'Rerunning the last failures after a red run runs only the test that failed',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a copy of the suite with its valid config')('suite', () => copiedRunnerSuite('valid')),
        Given('a red run of both worker files')('red', ({ suite }) => runCli({ suite, args: WORKER_FILES })),
        When('the run reruns the last failures')('rerun', ({ suite }) => runCli({ suite, args: ['--last-failed'] })),
        Then('only the failing sum ran, it failed again, and the rerun exits 1')((s, expect) =>
          expect({
            red: s.red.exitCode,
            exitCode: s.rerun.exitCode,
            ran: s.rerun.report.pipe(statusesOf, ranStatusesOf),
          }).toEqual({ red: 1, exitCode: 1, ran: { [B_FAILS]: 'failed' } })
        ),
      ),
    )

    scenario(
      'Rerunning the last failures after a green run starts nothing and exits 0',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a copy of the suite with its valid config')('suite', () => copiedRunnerSuite('valid')),
        Given('a green run of the file whose test uses every fixture')(
          'green',
          ({ suite }) => runCli({ suite, args: ['tests/fixtures.e2e.ts'] }),
        ),
        When('the run reruns the last failures')('rerun', ({ suite }) => runCli({ suite, args: ['--last-failed'] })),
        Then('the rerun exits 0, says nothing failed, prints no report, and leaves the green report in place')((
          s,
          expect,
        ) =>
          expect({
            green: s.green.exitCode,
            exitCode: s.rerun.exitCode,
            saysNothingFailed: s.rerun.stderr.includes('no failed test'),
            stdout: s.rerun.stdout,
            sameReport: runIdOf(s.rerun.report) === runIdOf(s.green.report),
          }).toEqual({ green: 0, exitCode: 0, saysNothingFailed: true, stdout: '', sameReport: true })
        ),
      ),
    )

    scenario(
      'A failing agent test under --ai-trace leaves its model calls with the planted secret masked',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a copy of the suite whose config declares the planted secret')(
          'suite',
          () => copiedRunnerSuite('valid'),
        ),
        When('the run selects the test whose act sends the planted secret to a model that cannot be reached')(
          'run',
          ({ suite }) => tracedRun(suite, ['--ai-trace', MODEL_CALL_FILE]),
        ),
        Then('the run exits 1, one trace names the failed call, and its bytes hold the mask but not the secret')((
          s,
          expect,
        ) =>
          expect({
            exitCode: s.run.cli.exitCode,
            report: statusesOf(s.run.cli.report),
            traces: s.run.traces.length,
            firstCall: s.run.firstCall,
            secretBytes: s.run.traces.some(({ text }) =>
              text.includes(PLANTED_SECRET) || text.includes(ESCAPED_SECRET)
            ),
            masked: s.run.traces.every(({ text }) => text.includes('[secret:planted]')),
          }).toEqual({
            exitCode: 1,
            report: { [MODEL_CALL_TEST]: 'failed' },
            traces: 1,
            firstCall: {
              step: 'step-2',
              request: { model: 'never-called' },
              outcome: { _tag: 'Failed', code: 'MODEL_PROVIDER_FAILED' },
            },
            secretBytes: false,
            masked: true,
          })
        ),
      ),
    )

    scenario(
      'The same failing agent test without --ai-trace leaves no ai-trace.json',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a copy of the suite whose config declares the planted secret')(
          'suite',
          () => copiedRunnerSuite('valid'),
        ),
        When('the run selects the same test without --ai-trace')(
          'run',
          ({ suite }) => tracedRun(suite, [MODEL_CALL_FILE]),
        ),
        Then('the run exits 1 with the test failed and no ai-trace.json under the results')((s, expect) =>
          expect({
            exitCode: s.run.cli.exitCode,
            report: statusesOf(s.run.cli.report),
            traces: s.run.traces.length,
          }).toEqual({ exitCode: 1, report: { [MODEL_CALL_TEST]: 'failed' }, traces: 0 })
        ),
      ),
    )
  })
