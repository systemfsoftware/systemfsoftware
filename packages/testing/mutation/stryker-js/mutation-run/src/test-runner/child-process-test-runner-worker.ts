import type { StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { PluginKind, RunConfiguration, SandboxDirectory } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import type {
  DryRunOptions,
  DryRunResult,
  MutantRunOptions,
  MutantRunResult,
  TestRunnerCapabilities,
} from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { DryRunStatus, MutantRunStatus, TestRunner } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { errorToString } from '@systemfsoftware/stryker-js-util'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as S from 'effect/Schema'
import type * as Scope from 'effect/Scope'

import type { PluginCreator } from '../plugins/index.js'
import { PluginNotFoundError } from '../plugins/plugin-loader.schema.js'

import { MutantCoverageSchema } from './mutant-coverage.schema.js'

export class ChildProcessTestRunnerWorker {
  private readonly underlying: TestRunner['Service']

  constructor(underlying: TestRunner['Service']) {
    this.underlying = underlying
  }

  /**
   * Build the worker around the test runner the run configured.
   *
   * `options.testRunner` names a `PluginKind.TestRunner` contribution, the
   * contribution carries a `Layer`, and building that layer in this scope is
   * what produces the runner. The layer asks for the plugin environment, which
   * this process supplies from what it has: the options arrived over the IPC
   * channel, and the sandbox is its own working directory because the parent
   * spawned it there.
   *
   * A missing or unbuildable runner fails. It must not resolve to something
   * whose `mutantRun` answers `status: Error`, because `Error` is neither killed
   * nor survived — every mutant would drop out of the score with nothing
   * reporting a reason.
   */
  static make(
    options: StrykerOptions,
    pluginCreator: PluginCreator,
  ): Effect.Effect<ChildProcessTestRunnerWorker, PluginNotFoundError, Scope.Scope> {
    return Effect.gen(function*() {
      const contribution = yield* pluginCreator.create(PluginKind.TestRunner, options.testRunner)
      const context = yield* Layer.build(contribution.layer)
      return new ChildProcessTestRunnerWorker(Context.get(context, TestRunner))
    }).pipe(
      Effect.provideService(RunConfiguration, options),
      Effect.provideService(SandboxDirectory, process.cwd()),
    )
  }

  async capabilities(): Promise<TestRunnerCapabilities> {
    return Effect.runPromise(this.underlying.capabilities)
  }

  async init(): Promise<void> {
    await Effect.runPromise(this.underlying.init)
  }

  async dispose(): Promise<void> {
    await Effect.runPromise(this.underlying.dispose)
  }

  async dryRun(options: DryRunOptions): Promise<DryRunResult> {
    const result = await Effect.runPromise(this.underlying.dryRun(options))
    if (result.status === DryRunStatus.Complete && !result.mutantCoverage && options.coverageAnalysis !== 'off') {
      const decoded = await Effect.runPromise(
        S.decodeUnknownEffect(S.optional(MutantCoverageSchema))(globalThis.__mutantCoverage__).pipe(
          Effect.orElseSucceed(() => undefined),
        ),
      )
      if (decoded !== undefined) {
        result.mutantCoverage = decoded
      }
    }
    if (result.status === DryRunStatus.Error) {
      result.errorMessage = errorToString(result.errorMessage)
    }
    return result
  }

  async mutantRun(options: MutantRunOptions): Promise<MutantRunResult> {
    const result = await Effect.runPromise(this.underlying.mutantRun(options))
    if (result.status === MutantRunStatus.Error) {
      result.errorMessage = errorToString(result.errorMessage)
    }
    return result
  }
}
