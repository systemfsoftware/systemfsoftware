import { type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { commonTokens, PluginKind, tokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import {
  type DryRunOptions,
  type DryRunResult,
  DryRunStatus,
  type MutantRunOptions,
  type MutantRunResult,
  MutantRunStatus,
  type TestRunner,
  type TestRunnerCapabilities,
} from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { errorToString } from '@systemfsoftware/stryker-js-util'
import * as S from 'effect/Schema'

import { injectionTokens, PluginCreator } from '../plugins/index.js'
import { MutantCoverageSchema } from './mutant-coverage.schema.js'

export class ChildProcessTestRunnerWorker implements TestRunner {
  private readonly underlyingTestRunner: TestRunner

  public static inject = tokens(commonTokens.options, injectionTokens.pluginCreator)
  constructor({ testRunner }: StrykerOptions, pluginCreator: PluginCreator) {
    this.underlyingTestRunner = pluginCreator.create(
      PluginKind.TestRunner,
      testRunner,
    )
  }

  public async capabilities(): Promise<TestRunnerCapabilities> {
    return this.underlyingTestRunner.capabilities()
  }

  public async init(): Promise<void> {
    if (this.underlyingTestRunner.init) {
      await this.underlyingTestRunner.init()
    }
  }

  public async dispose(): Promise<void> {
    if (this.underlyingTestRunner.dispose) {
      await this.underlyingTestRunner.dispose()
    }
  }

  public async dryRun(options: DryRunOptions): Promise<DryRunResult> {
    const dryRunResult = await this.underlyingTestRunner.dryRun(options)
    if (
      dryRunResult.status === DryRunStatus.Complete &&
      !dryRunResult.mutantCoverage &&
      options.coverageAnalysis !== 'off'
    ) {
      const mutantCoverage = S.decodeUnknownSync(
        S.optional(MutantCoverageSchema),
      )(globalThis.__mutantCoverage__)
      if (mutantCoverage !== undefined) {
        dryRunResult.mutantCoverage = mutantCoverage
      }
    }
    if (dryRunResult.status === DryRunStatus.Error) {
      dryRunResult.errorMessage = errorToString(dryRunResult.errorMessage)
    }
    return dryRunResult
  }
  public async mutantRun(options: MutantRunOptions): Promise<MutantRunResult> {
    const result = await this.underlyingTestRunner.mutantRun(options)
    if (result.status === MutantRunStatus.Error) {
      result.errorMessage = errorToString(result.errorMessage)
    }
    return result
  }
}
