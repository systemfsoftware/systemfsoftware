import { CheckStatus } from '@systemfsoftware/stryker-js-plugin-api/check'
import {
  type Mutant,
  type MutantResult,
  type MutantRunPlan,
  PlanKind,
} from '@systemfsoftware/stryker-js-plugin-api/core'
import { type Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { RunConfiguration, SandboxDirectory } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { Reporter, type ReporterService } from '@systemfsoftware/stryker-js-plugin-api/report'
import type { MutantRunOptions } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Pool from 'effect/Pool'
import * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import { createRequire } from 'node:module'
import { checkPlans, groupPlans } from '../checker/checker-facade.js'
import { createCheckerFactory } from '../checker/checker-factory.js'
import type { CheckerResourceService } from '../checker/checker-resource.js'
import { LoggingServerAddressService } from '../logging/logging-server.js'
import { forMutant, hasStaticCoverage } from '../mutants/test-coverage.js'
import type { TestCoverage } from '../mutants/test-coverage.js'
import { makeMutationReportingService } from '../reporting/mutation-reporting.js'
import type { MutationReportingService } from '../reporting/mutation-reporting.js'
import { checkStatusToMutantStatus, mapRunResult, toSchemaLocation } from '../reporting/mutation-reporting.kernel.js'
import { IdGeneratorService } from '../run-layers.js'
import { RunEnvironment } from '../RunEnvironment.js'
import type { SandboxHandle } from '../sandbox/sandbox.js'
import { StrykerError } from '../stryker-error.schema.js'
import { makeChildProcessTestRunner } from '../test-runner/child-process-test-runner-proxy.js'
import type { PooledTestRunner } from '../test-runner/child-process-test-runner-proxy.js'
import { humanReadableElapsed } from '../timer.js'
import type { IdGenerator } from '../worker-pool/id-generator.js'
import { ChildProcessCrashedError, OutOfMemoryError } from '../worker-pool/worker-pool.schema.js'
import type { DryRunDone, MutationTestStage } from './stage-results.js'
export class MutationTestLogger extends Context.Service<MutationTestLogger, Logger>()('MutationTestLogger') {}
export class CheckerPool extends Context.Service<CheckerPool, Pool.Pool<CheckerResourceService>>()('CheckerPool') {}
export class TestRunnerPool extends Context.Service<TestRunnerPool, Pool.Pool<PooledTestRunner>>()('TestRunnerPool') {}
const buildCoveredPlans = (
  rawMutants: readonly Mutant[],
  testCoverage: TestCoverage,
  sandbox: SandboxHandle,
): { coveredPlans: MutantRunPlan[]; noCoverage: MutantResult[] } => {
  const noCoverage: MutantResult[] = []
  const coveredPlans: MutantRunPlan[] = []
  for (const mutant of rawMutants) {
    const testsForMutant = forMutant(testCoverage, mutant.id)
    let testIds: readonly string[] | undefined
    if (testsForMutant !== undefined && testsForMutant.size > 0) {
      testIds = [...testsForMutant].map((t) => t.id)
    } else if (hasStaticCoverage(testCoverage, mutant.id)) {
      const allIds = [...testCoverage.testsById.values()].map((t) => t.id)
      testIds = allIds.length > 0 ? allIds : undefined
    }
    if (testIds === undefined || testIds.length === 0) {
      const result = {
        id: mutant.id,
        mutatorName: mutant.mutatorName,
        fileName: mutant.fileName,
        location: mutant.location,
        status: 'NoCoverage' as const,
        replacement: mutant.replacement,
      } as MutantResult
      noCoverage.push(result)
      continue
    }
    const runOptions: MutantRunOptions = {
      activeMutant: mutant,
      sandboxFileName: sandbox.sandboxFileFor(mutant.fileName),
      mutantActivation: 'runtime' as const,
      reloadEnvironment: false,
      timeout: 5000,
      disableBail: false,
      testFilter: [...testIds],
    }
    const plan: MutantRunPlan = { plan: PlanKind.Run, mutant, runOptions, netTime: 0 }
    coveredPlans.push(plan)
  }
  return { coveredPlans, noCoverage }
}
function reloadEnvironmentLast(a: MutantRunPlan, b: MutantRunPlan): number {
  const aReload = a.runOptions.reloadEnvironment
  const bReload = b.runOptions.reloadEnvironment
  if (aReload === bReload) return 0
  return aReload ? 1 : -1
}
const voidReporter: ReporterService = {
  onDryRunCompleted: () => Effect.void,
  onMutationTestingPlanReady: () => Effect.void,
  onMutantTested: () => Effect.void,
  onMutationTestReportReady: () => Effect.void,
  wrapUp: Effect.void,
}
export const mutationTestStage: MutationTestStage<
  unknown,
  | MutationTestLogger
  | RunEnvironment
  | Scope.Scope
  | LoggingServerAddressService
  | IdGenerator
  | FileSystem.FileSystem
  | Path.Path
> = (prev) =>
  Effect.gen(function*() {
    const log = yield* MutationTestLogger
    const env = yield* RunEnvironment
    if (prev.options.dryRunOnly) {
      log.info('The dry-run has been completed successfully. No mutations have been executed.')
      return [] as readonly MutantResult[]
    }
    if (prev.dryRunResult.tests.length === 0 && prev.options.allowEmpty) {
      const now = yield* Clock.currentTimeMillis
      log.info('Done in %s.', humanReadableElapsed(prev.timer, now))
      return [] as readonly MutantResult[]
    }
    const reporterService: ReporterService = yield* Effect.gen(function*() {
      if (prev.options.reporters.length === 0) {
        return voidReporter
      }
      const layerOpt = prev.plugins.layer
      if (Option.isNone(layerOpt)) {
        return yield* new StrykerError({
          message: `Reporters [${
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
        return yield* new StrykerError({
          message: `Reporter service not found in plugin context; configured reporters: ${
            prev.options.reporters.join(', ')
          }`,
        })
      }
      return maybeReporter.value
    })
    const loggingServerAddress = yield* LoggingServerAddressService
    const idGenerator = yield* IdGeneratorService
    const hasCheckers = prev.options.checkers.length > 0
    const checkerPool: Pool.Pool<CheckerResourceService, unknown> | undefined = hasCheckers
      ? yield* Pool.make({
        acquire: createCheckerFactory(
          prev.options,
          prev.project.fileDescriptions,
          loggingServerAddress,
          prev.loadedPlugins.pluginModulePaths,
          () => log,
          idGenerator,
          prev.sandbox.workingDirectory,
        ),
        size: prev.concurrency.checkers,
      })
      : undefined
    const testRunnerPool = yield* Pool.make({
      acquire: makeChildProcessTestRunner({
        options: prev.options,
        fileDescriptions: prev.project.fileDescriptions,
        sandboxWorkingDirectory: prev.sandbox.workingDirectory,
        loggingServerAddress,
        pluginModulePaths: [...prev.loadedPlugins.pluginModulePaths],
        logger: log,
        idGenerator,
      }),
      size: prev.concurrency.testRunners,
    })
    const reporting: MutationReportingService = {
      reportCheckFailure: (mutant, result) => {
        const location = toSchemaLocation(mutant.location)
        const status = checkStatusToMutantStatus(result.status)
        const mapped = {
          id: mutant.id,
          mutatorName: mutant.mutatorName,
          fileName: mutant.fileName,
          location,
          status,
          replacement: mutant.replacement,
        } as MutantResult
        return reporterService.onMutantTested(mapped).pipe(Effect.as(mapped))
      },
      reportMutantRunResult: (mutant, result) => {
        const mapped = mapRunResult(mutant, result)
        return reporterService.onMutantTested(mapped).pipe(Effect.as(mapped))
      },
      reportAll: (results) => Effect.succeed({ results, verdict: null }),
    }
    const { coveredPlans, noCoverage: noCoverageResults } = buildCoveredPlans(
      prev.mutants,
      prev.testCoverage,
      prev.sandbox,
    )
    const sortedPlans = [...coveredPlans].sort(reloadEnvironmentLast)
    // Publish the plan so progress total is known before any mutant is tested
    const allPlansForReporter = [...sortedPlans] as readonly MutantRunPlan[]
    yield* reporterService.onMutationTestingPlanReady({ mutantPlans: allPlansForReporter }).pipe(Effect.ignoreCause)
    env.runEventSink({ kind: 'plan', total: allPlansForReporter.length + noCoverageResults.length })
    let passedPlans: readonly MutantRunPlan[] = sortedPlans
    if (hasCheckers && checkerPool !== undefined) {
      for (const checkerName of prev.options.checkers) {
        const checked = yield* Effect.scoped(Effect.flatMap(Pool.get(checkerPool), (checker) =>
          checkPlans(checker, checkerName, passedPlans).pipe(Effect.catchTags({
            OutOfMemoryError: (error) =>
              Effect.flatMap(Pool.invalidate(checkerPool, checker), () =>
                Effect.fail(error)),
            ChildProcessCrashedError: (error) =>
              Effect.flatMap(Pool.invalidate(checkerPool, checker), () =>
                Effect.fail(error)),
          }))))
        const kept: MutantRunPlan[] = []
        for (const [plan, result] of checked) {
          if (result.status === CheckStatus.Passed) {
            kept.push(plan)
            continue
          }
          yield* reporting.reportCheckFailure(plan.mutant, result)
        }
        passedPlans = kept
      }
    }
    const lastChecker = prev.options.checkers.at(-1)
    const executionOrder: readonly MutantRunPlan[] = lastChecker === undefined || checkerPool === undefined
      ? passedPlans
      : (yield* Effect.scoped(Effect.flatMap(Pool.get(checkerPool), (checker) =>
        groupPlans(checker, lastChecker, passedPlans).pipe(Effect.catchTags({
          OutOfMemoryError: (error) =>
            Effect.flatMap(Pool.invalidate(checkerPool, checker), () =>
              Effect.fail(error)),
          ChildProcessCrashedError: (error) =>
            Effect.flatMap(Pool.invalidate(checkerPool, checker), () =>
              Effect.fail(error)),
        }))))).flat()
    const testRunnerStream = Stream.fromIterable(executionOrder)
    const runResults: MutantResult[] = yield* Stream.mapEffect(testRunnerStream, (plan) =>
      Effect.scoped(Effect.gen(function*() {
        const pool = testRunnerPool
        const runner = yield* Pool.get(pool)
        const result = yield* runner.mutantRun(plan.runOptions).pipe(Effect.catchTags({
          OutOfMemoryError: (error) =>
            Effect.flatMap(Pool.invalidate(pool, runner), () =>
              Effect.fail(error)),
          ChildProcessCrashedError: (error) =>
            Effect.flatMap(Pool.invalidate(pool, runner), () =>
              Effect.fail(error)),
        }))
        return yield* reporting.reportMutantRunResult(plan.mutant, result)
      })), { concurrency: Math.max(1, prev.concurrency.testRunners) }).pipe(
        Stream.runCollect,
        Effect.map((chunk) => [...chunk]),
      )
    const allResults: MutantResult[] = [...noCoverageResults, ...runResults]
    for (const result of allResults) {
      yield* reporterService.onMutantTested(result).pipe(Effect.catchCause((cause) =>
        Effect.sync(() => {
          log.warn('Reporter failed handling onMutantTested', cause)
        })
      ))
    }
    const realReporting = makeMutationReportingService({
      reporter: reporterService,
      options: prev.options,
      project: prev.project,
      log,
      testCoverage: prev.testCoverage,
      requireFromCwd: (id) => {
        try {
          const requireFn = createRequire(import.meta.url)
          return requireFn(`${id}/package.json`) as unknown
        } catch {
          return undefined
        }
      },
      runEventSink: env.runEventSink,
      runId: env.runId,
      resolvedMode: env.resolvedMode,
      pluginsByKind: prev.loadedPlugins.pluginsByKind,
      sandboxDirectory: prev.sandbox.workingDirectory,
      basePath: env.basePath,
    })
    const outcome = yield* realReporting.reportAll(allResults)
    yield* reporterService.wrapUp.pipe(Effect.catchCause((cause) =>
      Effect.sync(() => {
        log.warn('Reporter failed handling wrapUp', cause)
      })
    ))
    const doneNow = yield* Clock.currentTimeMillis
    log.info('Done in %s.', humanReadableElapsed(prev.timer, doneNow))
    return outcome.results
  })
