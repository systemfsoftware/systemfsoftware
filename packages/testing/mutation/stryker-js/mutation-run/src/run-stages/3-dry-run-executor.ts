import { EOL } from 'os'

import { type Mutant, type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { type Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { commonTokens, type Injector, tokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { type DryRunCompletedEvent, type RunTiming } from '@systemfsoftware/stryker-js-plugin-api/report'
import {
  type CompleteDryRunResult,
  type DryRunResult,
  DryRunStatus,
  type ErrorDryRunResult,
  type FailedTestResult,
  type TestResult,
  type TestRunner,
  TestStatus,
} from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { type I, requireResolve } from '@systemfsoftware/stryker-js-util'
import { lastValueFrom, of } from 'rxjs'

import { CheckerFacade } from '../checker/index.js'
import { FileMatcher } from '../config/index.js'
import { ConfigError } from '../errors.js'
import { IncrementalDiffer, MutantTestPlanner, TestCoverage } from '../mutants/index.js'
import { injectionTokens } from '../plugins/index.js'
import { MutationTestReportHelper } from '../reporting/mutation-test-report-helper.js'
import { type StrictReporter } from '../reporting/strict-reporter.js'
import { Sandbox } from '../sandbox/sandbox.js'
import { createTestRunnerFactory } from '../test-runner/index.js'
import { Timer } from '../timer.js'
import { ConcurrencyTokenProvider, createTestRunnerPool, Pool } from '../worker-pool/index.js'

import { IdGenerator } from '../worker-pool/id-generator.js'
import { map } from './map.js'

import { type MutantInstrumenterContext } from './2-mutant-instrumenter-executor.js'
import { type MutationTestContext } from './4-mutation-test-executor.js'

const INITIAL_TEST_RUN_MARKER = 'Initial test run'

export interface DryRunContext extends MutantInstrumenterContext {
  [injectionTokens.sandbox]: I<Sandbox>
  [injectionTokens.mutants]: readonly Mutant[]
  [injectionTokens.checkerPool]: I<Pool<I<CheckerFacade>>>
  [injectionTokens.concurrencyTokenProvider]: I<ConcurrencyTokenProvider>
}

function isFailedTest(testResult: TestResult): testResult is FailedTestResult {
  return testResult.status === TestStatus.Failed
}

export class DryRunExecutor {
  public static readonly inject = tokens(
    commonTokens.injector,
    commonTokens.logger,
    commonTokens.options,
    injectionTokens.timer,
    injectionTokens.concurrencyTokenProvider,
    injectionTokens.sandbox,
    injectionTokens.reporter,
  )

  constructor(
    private readonly injector: Injector<DryRunContext>,
    private readonly log: Logger,
    private readonly options: StrykerOptions,
    private readonly timer: I<Timer>,
    private readonly concurrencyTokenProvider: I<ConcurrencyTokenProvider>,
    private readonly sandbox: I<Sandbox>,
    private readonly reporter: StrictReporter,
  ) {}

  public async execute(): Promise<Injector<MutationTestContext>> {
    const testRunnerInjector = this.injector
      .provideClass(injectionTokens.workerIdGenerator, IdGenerator)
      .provideFactory(injectionTokens.testRunnerFactory, createTestRunnerFactory)
      .provideValue(
        injectionTokens.testRunnerConcurrencyTokens,
        this.concurrencyTokenProvider.testRunnerToken$,
      )
      .provideFactory(injectionTokens.testRunnerPool, createTestRunnerPool)
    const testRunnerPool = testRunnerInjector.resolve(
      injectionTokens.testRunnerPool,
    )
    const { result, timing } = await lastValueFrom(
      testRunnerPool.schedule(of(0), (testRunner) => this.executeDryRun(testRunner)),
    )

    this.logInitialTestRunSucceeded(result.tests, timing)
    if (!result.tests.length && !this.options.allowEmpty) {
      throw new ConfigError(
        'No tests were executed. Stryker will exit prematurely. Please check your configuration.',
      )
    }

    return testRunnerInjector
      .provideValue(injectionTokens.timeOverheadMS, timing.overhead)
      .provideValue(injectionTokens.dryRunResult, result)
      .provideValue(injectionTokens.requireFromCwd, requireResolve)
      .provideFactory(injectionTokens.testCoverage, TestCoverage.from)
      .provideClass(injectionTokens.incrementalDiffer, IncrementalDiffer)
      .provideClass(injectionTokens.mutantTestPlanner, MutantTestPlanner)
      .provideClass(
        injectionTokens.mutationTestReportHelper,
        MutationTestReportHelper,
      )
      .provideClass(injectionTokens.workerIdGenerator, IdGenerator)
  }

  private validateResultCompleted(
    runResult: DryRunResult,
  ): asserts runResult is CompleteDryRunResult {
    switch (runResult.status) {
      case DryRunStatus.Complete: {
        const failedTests = runResult.tests.filter(isFailedTest)
        if (failedTests.length) {
          this.logFailedTestsInInitialRun(failedTests)
          throw new ConfigError(
            'There were failed tests in the initial test run.',
          )
        }
        return
      }
      case DryRunStatus.Error:
        this.logErrorsInInitialRun(runResult)
        break
      case DryRunStatus.Timeout:
        this.logTimeoutInitialRun()
        break
    }
    throw new Error('Something went wrong in the initial test run')
  }

  private async executeDryRun(
    testRunner: TestRunner,
  ): Promise<DryRunCompletedEvent> {
    if (this.options.dryRunOnly) {
      this.log.info(
        'Note: running the dry-run only. No mutations will be tested.',
      )
    }

    const dryRunTimeout = this.options.dryRunTimeoutMinutes * 1000 * 60
    const project = this.injector.resolve(injectionTokens.project)
    const dryRunFiles = map(project.filesToMutate, (_, name) => this.sandbox.sandboxFileFor(name))
    const testFiles = project.testFiles.length > 0
      ? project.testFiles.map((file) => this.sandbox.sandboxFileFor(file))
      : undefined
    const dryRunOptions = {
      timeout: dryRunTimeout,
      coverageAnalysis: this.options.coverageAnalysis,
      disableBail: this.options.disableBail,
      files: dryRunFiles,
      ...(testFiles ? { testFiles } : {}),
    }
    this.timer.mark(INITIAL_TEST_RUN_MARKER)
    this.log.info(
      `Starting initial test run (${this.options.testRunner} test runner with "${this.options.coverageAnalysis}" coverage analysis). This may take a while.`,
    )
    this.log.debug(`Using timeout of ${dryRunTimeout} ms.`)
    const result = await testRunner.dryRun({
      timeout: dryRunTimeout,
      coverageAnalysis: this.options.coverageAnalysis,
      disableBail: this.options.disableBail,
      files: dryRunFiles,
      ...(testFiles ? { testFiles } : {}),
    })
    const grossTimeMS = this.timer.elapsedMs(INITIAL_TEST_RUN_MARKER)
    const capabilities = await testRunner.capabilities()
    this.validateResultCompleted(result)

    this.remapSandboxFilesToOriginalFiles(result)
    const timing = this.calculateTiming(grossTimeMS, result.tests)
    const dryRunCompleted = { result, timing, capabilities }
    this.reporter.onDryRunCompleted(dryRunCompleted)
    return dryRunCompleted
  }

  /**
   * Remaps test files to their respective original names outside the sandbox.
   * @param dryRunResult the completed result
   */
  private remapSandboxFilesToOriginalFiles(dryRunResult: CompleteDryRunResult) {
    const disableTypeCheckingFileMatcher = new FileMatcher(
      this.options.disableTypeChecks,
    )
    dryRunResult.tests.forEach((test) => {
      if (test.fileName) {
        test.fileName = this.sandbox.originalFileFor(test.fileName)

        // HACK line numbers of the tests can be offset by 1 because the disable type checks preprocessor could have added a `// @ts-nocheck` line.
        // We correct for that here if needed
        // If we do more complex stuff in sandbox preprocessing in the future, we might want to add a robust remapping logic
        if (
          test.startPosition &&
          disableTypeCheckingFileMatcher.matches(test.fileName)
        ) {
          test.startPosition.line--
        }
      }
    })
  }

  private logInitialTestRunSucceeded(tests: TestResult[], timing: RunTiming) {
    if (!tests.length) {
      this.log.info('No tests were found')
      return
    }

    this.log.info(
      'Initial test run succeeded. Ran %s tests in %s (net %s ms, overhead %s ms).',
      tests.length,
      this.timer.humanReadableElapsed(INITIAL_TEST_RUN_MARKER),
      timing.net,
      timing.overhead,
    )
  }

  /**
   * Calculates the timing variables for the test run.
   * grossTime = NetTime + overheadTime
   *
   * The overhead time is used to calculate exact timeout values during mutation testing.
   * See timeoutMS setting in README for more information on this calculation
   */
  private calculateTiming(
    grossTimeMS: number,
    tests: readonly TestResult[],
  ): RunTiming {
    const netTimeMS = tests.reduce(
      (total, test) => total + test.timeSpentMs,
      0,
    )
    const overheadTimeMS = grossTimeMS - netTimeMS
    return {
      net: netTimeMS,
      overhead: overheadTimeMS < 0 ? 0 : overheadTimeMS,
    }
  }

  private logFailedTestsInInitialRun(failedTests: FailedTestResult[]): void {
    let message = 'One or more tests failed in the initial test run:'
    failedTests.forEach((test) => {
      message += `${EOL}\t${test.name}`
      message += `${EOL}\t\t${test.failureMessage}`
    })
    this.log.error(message)
  }
  private logErrorsInInitialRun(runResult: ErrorDryRunResult) {
    const message = `One or more tests resulted in an error:${EOL}\t${runResult.errorMessage}`
    this.log.error(message)
  }

  private logTimeoutInitialRun() {
    this.log.error('Initial test run timed out!')
  }
}
