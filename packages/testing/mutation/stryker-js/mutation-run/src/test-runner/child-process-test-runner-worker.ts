import { NodeFileSystem } from '@effect/platform-node'
import { NodePath } from '@effect/platform-node'
import type { StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js-plugin-api/core'
import { errorToString } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { PluginKind, RunConfiguration, SandboxDirectory } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import type {
  DryRunOptions,
  DryRunResult,
  MutantRunOptions,
  MutantRunResult,
  TestRunnerCapabilities,
} from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { DryRunStatus, MutantRunStatus, TestRunner } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as S from 'effect/Schema'
import { StrykerError } from '../stryker-error.schema.js'

import { create } from '../plugins/plugin-creator.js'
import { loadPlugins } from '../plugins/plugin-loader.js'

import { MutantCoverageSchema } from './mutant-coverage.schema.js'

const noopLogger: Logger = {
  isTraceEnabled: () => false,
  isDebugEnabled: () => false,
  isInfoEnabled: () => false,
  isWarnEnabled: () => false,
  isErrorEnabled: () => false,
  isFatalEnabled: () => false,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
}

const makeChildProcessTestRunnerWorker = () => {
  let underlying: TestRunner['Service'] | undefined = undefined

  const capabilities = async (): Promise<TestRunnerCapabilities> => {
    if (underlying === undefined) {
      throw new StrykerError({
        message: 'ChildProcessTestRunnerWorker not initialized: call init before capabilities',
        cause: undefined,
      })
    }
    return Effect.runPromise(underlying.capabilities)
  }

  const init = async (...args: unknown[]): Promise<void> => {
    if (underlying !== undefined) {
      await Effect.runPromise(underlying.init)
      return
    }
    if (args.length === 0) {
      throw new StrykerError({
        message: 'ChildProcessTestRunnerWorker not initialized: init requires StrykerOptions',
        cause: undefined,
      })
    }
    let options: StrykerOptions
    try {
      options = await Effect.runPromise(S.decodeUnknownEffect(StrykerOptionsSchema)(args[0]))
    } catch (cause: unknown) {
      throw new StrykerError({
        message: 'ChildProcessTestRunnerWorker init received invalid StrykerOptions',
        cause,
      })
    }
    let pluginsByKind
    try {
      const loaded = await Effect.runPromise(
        loadPlugins(options.plugins, noopLogger, process.cwd()).pipe(
          Effect.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer)),
        ),
      )
      pluginsByKind = loaded.pluginsByKind
    } catch (cause: unknown) {
      throw new StrykerError({
        message: 'ChildProcessTestRunnerWorker failed to load plugins',
        cause,
      })
    }
    const built = await Effect.runPromise(
      Effect.gen(function*() {
        const contribution = yield* create(pluginsByKind, PluginKind.TestRunner, options.testRunner)
        const runner = yield* Effect.gen(function*() {
          const r = yield* TestRunner
          return r
        }).pipe(Effect.provide(contribution.layer))
        return runner
      }).pipe(
        Effect.provide(
          Layer.merge(Layer.succeed(RunConfiguration, options), Layer.succeed(SandboxDirectory, process.cwd())),
        ),
      ),
    )
    underlying = built
    await Effect.runPromise(built.init)
  }

  const dispose = async (): Promise<void> => {
    if (underlying === undefined) {
      return
    }
    await Effect.runPromise(underlying.dispose)
  }

  const dryRun = async (options: DryRunOptions): Promise<DryRunResult> => {
    if (underlying === undefined) {
      throw new StrykerError({
        message: 'ChildProcessTestRunnerWorker not initialized: call init before dryRun',
        cause: undefined,
      })
    }
    const result = await Effect.runPromise(underlying.dryRun(options))
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

  const mutantRun = async (options: MutantRunOptions): Promise<MutantRunResult> => {
    if (underlying === undefined) {
      throw new StrykerError({
        message: 'ChildProcessTestRunnerWorker not initialized: call init before mutantRun',
        cause: undefined,
      })
    }
    const result = await Effect.runPromise(underlying.mutantRun(options))
    if (result.status === MutantRunStatus.Error) {
      result.errorMessage = errorToString(result.errorMessage)
    }
    return result
  }

  return {
    capabilities,
    init,
    dispose,
    dryRun,
    mutantRun,
  }
}

export const ChildProcessTestRunnerWorker = makeChildProcessTestRunnerWorker()
