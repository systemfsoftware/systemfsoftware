import { type Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { RunConfiguration, SandboxDirectory } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { Reporter, type ReporterService } from '@systemfsoftware/stryker-js-plugin-api/report'
import { DryRunStatus } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { TestStatus } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import type { FailedTestResult } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Scope from 'effect/Scope'
import * as ChildProcessSpawner from 'effect/unstable/process/ChildProcessSpawner'
import fs from 'node:fs'
import { testCoverageFrom } from '../mutants/test-coverage.js'
import { makeChildProcessTestRunner } from '../test-runner/child-process-test-runner-proxy.js'
import { buildTestRunner } from '../test-runner/index.js'
import { elapsedMs, humanReadableElapsed, markTimer } from '../timer.js'
import { IdGenerator } from '../worker-pool/id-generator.js'
import type { DryRunDone, DryRunStage, InstrumentDone } from './stage-results.js'
import { StageError } from './stage.schema.js'
const INITIAL_TEST_RUN_MARKER = 'Initial test run'

export class DryRunLogger extends Context.Service<DryRunLogger, Logger>()('DryRunLogger') {}

function buildDryRunFiles(prev: InstrumentDone): { files: string[]; testFiles: string[] | undefined } {
  const files = [...prev.project.filesToMutate.keys()].map((name) => prev.sandbox.sandboxFileFor(name))
  const testFiles = prev.project.testFiles.length > 0
    ? prev.project.testFiles.map((file) => prev.sandbox.sandboxFileFor(file))
    : undefined
  return { files, testFiles }
}

const noopReporter: ReporterService = {
  onDryRunCompleted: () => Effect.void,
  onMutationTestingPlanReady: () => Effect.void,
  onMutantTested: () => Effect.void,
  onMutationTestReportReady: () => Effect.void,
  wrapUp: Effect.void,
}

export const dryRunStage: DryRunStage<
  StageError,
  DryRunLogger | Scope.Scope | IdGenerator | ChildProcessSpawner.ChildProcessSpawner
> = (prev) =>
  Effect.gen(function*() {
    const log = yield* DryRunLogger
    const idGenerator = yield* IdGenerator

    const reporterService: ReporterService = yield* Effect.gen(function*() {
      if (prev.options.reporters.length === 0) {
        return noopReporter
      }
      const layerOpt = prev.plugins.layer
      if (Option.isNone(layerOpt)) {
        return yield* new StageError({
          stage: 'dryRun',
          reason: `Reporters [${
            prev.options.reporters.join(', ')
          }] configured but no plugin layer is available (no plugins loaded)`,
        })
      }
      const ctx = yield* Layer.build(layerOpt.value).pipe(
        Effect.provideService(RunConfiguration, prev.options),
        Effect.provideService(SandboxDirectory, prev.temporaryDirectoryPath),
      )
      const maybeReporter = Context.getOption(ctx, Reporter)
      if (Option.isNone(maybeReporter)) {
        return yield* new StageError({
          stage: 'dryRun',
          reason: `Reporter service not found in plugin context; configured reporters: ${
            prev.options.reporters.join(', ')
          }`,
        })
      }
      return maybeReporter.value
    })

    const { files, testFiles } = buildDryRunFiles(prev)
    const dryRunTimeout = prev.options.dryRunTimeoutMinutes * 60 * 1000

    const markAt = yield* Clock.currentTimeMillis
    const timerWithMark = markTimer(prev.timer, INITIAL_TEST_RUN_MARKER, markAt)
    log.info('Starting dry run')
    const { rawResult, capabilities, gross } = yield* Effect.scoped(
      Effect.gen(function*() {
        const childRunnerEffect = makeChildProcessTestRunner({
          options: prev.options,
          fileDescriptions: prev.project.fileDescriptions,
          sandboxWorkingDirectory: prev.sandbox.workingDirectory,
          pluginModulePaths: [...prev.loadedPlugins.pluginModulePaths],
          logger: log,
          idGenerator,
        })
        const runner = yield* buildTestRunner(
          {
            options: prev.options,
            fileDescriptions: prev.project.fileDescriptions,
            sandboxWorkingDirectory: prev.sandbox.workingDirectory,
            pluginModulePaths: [...prev.loadedPlugins.pluginModulePaths],
            idGenerator,
            retire: Effect.void,
          },
          childRunnerEffect,
        )
        const rawResult = yield* runner
          .dryRun({
            timeout: dryRunTimeout,
            coverageAnalysis: prev.options.coverageAnalysis,
            disableBail: prev.options.disableBail,
            files,
            ...(testFiles !== undefined ? { testFiles } : {}),
          })
          .pipe(Effect.mapError((cause) => new StageError({ stage: 'dryRun', reason: 'Dry run failed', cause })))
        const nowAfter = yield* Clock.currentTimeMillis
        const gross = elapsedMs(timerWithMark, nowAfter, INITIAL_TEST_RUN_MARKER)
        const capabilities = yield* runner.capabilities.pipe(
          Effect.mapError((cause) =>
            new StageError({ stage: 'dryRun', reason: 'Failed to get test runner capabilities', cause })
          ),
        )
        return { rawResult, capabilities, gross }
      }),
    ).pipe(Effect.mapError((cause) => {
      if (cause instanceof StageError) {
        return cause
      }
      return new StageError({ stage: 'dryRun', reason: 'Dry run failed to start test runner', cause })
    }))

    if (rawResult.status === DryRunStatus.Complete) {
      if (prev.options.dryRunOnly) {
        log.info('Note: running the dry-run only. No mutations will be tested.')
      }

      if (rawResult.tests.length === 0 && !prev.options.allowEmpty) {
        return yield* new StageError({
          stage: 'dryRunNoTests',
          reason: 'No tests were executed. Stryker will exit prematurely. Please check your configuration.',
        })
      }

      const failedTests = rawResult.tests.filter(
        (test): test is FailedTestResult => test.status === TestStatus.Failed,
      )
      if (failedTests.length > 0) {
        let message = 'One or more tests failed in the initial test run:'
        for (const test of failedTests) {
          message += `\n\t${test.name}\n\t\t${test.failureMessage}`
        }
        log.error(message)
        return yield* new StageError({ stage: 'dryRun', reason: 'There were failed tests in the initial test run.' })
      }

      const tests = rawResult.tests.map((test) =>
        test.fileName !== undefined
          ? { ...test, fileName: prev.sandbox.originalFileFor(test.fileName) }
          : test
      )
      const dryRunResult = { ...rawResult, tests }

      const net = tests.reduce((total, test) => total + test.timeSpentMs, 0)
      const overhead = gross - net < 0 ? 0 : gross - net
      const timing = { net, overhead }

      const testCoverage = testCoverageFrom(dryRunResult, log)

      yield* reporterService
        .onDryRunCompleted({ result: dryRunResult, timing, capabilities })
        .pipe(Effect.ignoreCause)

      if (tests.length === 0) {
        log.info('No tests were found')
      } else {
        log.info(
          `Initial test run succeeded. Ran ${tests.length} tests in ${
            humanReadableElapsed(timerWithMark, yield* Clock.currentTimeMillis, INITIAL_TEST_RUN_MARKER)
          } (net ${timing.net} ms, overhead ${timing.overhead} ms).`,
        )
      }

      return {
        ...prev,
        dryRunResult,
        testCoverage,
        timeOverheadMS: overhead,
      } satisfies DryRunDone
    }

    if (rawResult.status === DryRunStatus.Error) {
      log.error(`One or more tests resulted in an error:\n\t${rawResult.errorMessage}`)
      return yield* new StageError({ stage: 'dryRun', reason: rawResult.errorMessage })
    }

    log.error('Initial test run timed out!')
    return yield* new StageError({ stage: 'dryRun', reason: rawResult.reason ?? 'Initial test run timed out' })
  })
