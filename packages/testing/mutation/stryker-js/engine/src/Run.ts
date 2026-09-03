import { Cell } from '@systemfsoftware/effect-cell-types'
import { instrument } from '@systemfsoftware/stryker-js-instrumenter'
import type { File as InstrumenterFile, InstrumentResult } from '@systemfsoftware/stryker-js-instrumenter'
import type { ExitClass } from '@systemfsoftware/stryker-js/ExitClass'
import type { IgnorerService } from '@systemfsoftware/stryker-js/Ignorer'
import { Ignorer } from '@systemfsoftware/stryker-js/Ignorer'
import { Module } from '@systemfsoftware/stryker-js/Module'
import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import type { MutantResult } from '@systemfsoftware/stryker-js/Mutant'
import type { MutantTestCoverage } from '@systemfsoftware/stryker-js/Mutant'
import type { RunPlan as MutantRunPlan } from '@systemfsoftware/stryker-js/Mutant'
import type { TestPlan } from '@systemfsoftware/stryker-js/Mutant'
import type { ComposedPlugins } from '@systemfsoftware/stryker-js/Plugin'
import type { AnyPluginContribution } from '@systemfsoftware/stryker-js/Plugin'
import { RunConfiguration } from '@systemfsoftware/stryker-js/Plugin'
import { SandboxDirectory } from '@systemfsoftware/stryker-js/Plugin'
import { composePlugins } from '@systemfsoftware/stryker-js/Plugin'
import { Reporter } from '@systemfsoftware/stryker-js/Reporter'
import type { ReporterService } from '@systemfsoftware/stryker-js/Reporter'
import { PhaseEntered } from '@systemfsoftware/stryker-js/Run'
import { MutantTested } from '@systemfsoftware/stryker-js/Run'
import { PlanKnown } from '@systemfsoftware/stryker-js/Run'
import type { RunEvent } from '@systemfsoftware/stryker-js/Run'
import { RunEvents } from '@systemfsoftware/stryker-js/Run'
import type { PartialStrykerOptions, StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import type { CompleteDryRunResult, DryRunResult, TestRunnerCapabilities } from '@systemfsoftware/stryker-js/TestRunner'
import type * as Cause from 'effect/Cause'
import * as Clock from 'effect/Clock'
import * as Console from 'effect/Console'
import * as Context from 'effect/Context'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as FileSystem from 'effect/FileSystem'
import * as HashMap from 'effect/HashMap'
import * as HashSet from 'effect/HashSet'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Pool from 'effect/Pool'
import * as Predicate from 'effect/Predicate'
import * as Queue from 'effect/Queue'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as Scope from 'effect/Scope'
import * as Semaphore from 'effect/Semaphore'
import * as Stream from 'effect/Stream'
import * as ChildProcessSpawner from 'effect/unstable/process/ChildProcessSpawner'

import type { CheckerResourceService } from './Checker.js'
import { checkGroupedPlans, createCheckerFactory } from './Checker.js'
import { forkCoreSchema, readConfig, validateOptions, type ValidationSchemaDocument } from './Config.js'
import { DryRunCommand, dryRunWorkflow } from './DryRun.workflow.js'
import { REMEMBERED_REASON, toRelativeNormalizedFileName } from './IncrementalDiff.paths.js'
import { InstrumentCommand, instrumentWorkflow } from './Instrument.workflow.js'
import { decidePlans, incrementalDiff } from './Mutants.js'
import type { TestCoverage } from './Mutants.js'
import { testCoverageFrom } from './Mutants.js'
import { MutationTestCommand } from './MutationTest.schema.js'
import { MutationTestError, mutationTestWorkflow } from './MutationTest.workflow.js'
import type { MutationTestDecision } from './MutationTest.workflow.js'
import type { ResolvedMode } from './output-mode.js'
import { createAll } from './Plugins.js'
import { loadPlugins } from './Plugins.js'
import type { LoadedPlugins } from './Plugins.js'
import type { Project } from './Project.js'
import { readProject } from './Project.js'
import { FILE_CONCURRENCY, readOriginal, toInstrumenterFile } from './Project.js'
import { withInstrumentedFiles } from './Project.js'
import { ansi } from './Reporter.ansi.js'
import { makeMutationReportingService } from './Reporter.js'
import { toSchemaLocation } from './Reporter.js'
import { normalizeReportFileName } from './Reporter.js'
import { selectReporters } from './Reporter.js'
import { PrepareError, StageError } from './Run.schema.js'
import { makeSandbox } from './Sandbox.js'
import type { SandboxHandle } from './Sandbox.js'
import { TemporaryDirectory } from './Sandbox.js'
import { TemporaryDirectoryLive } from './Sandbox.js'
import { StrykerError } from './stryker-error.schema.js'
import { buildTestRunner } from './TestRunner.js'
import { makeChildProcessTestRunner } from './TestRunner.js'
import type { PooledTestRunner } from './TestRunner.js'
import { makeConcurrency } from './Worker.js'
import { IdGenerator } from './Worker.js'
import { layer as idGeneratorLayer } from './Worker.js'
import { WorkerEntries, WorkerLauncher } from './WorkerLauncher.js'

// ── RunEnvironment ───────────────────────────────────────────────────────

export interface RunEnvironmentShape {
  readonly runId: string
  readonly resolvedMode: ResolvedMode
  readonly runStartedAt: number
  readonly basePath: string
  readonly reporterPluginModules: readonly string[]
  readonly allowConsoleColors: boolean
}

export class RunEnvironment extends Context.Service<RunEnvironment, RunEnvironmentShape>()(
  '@systemfsoftware/stryker-js-engine/RunEnvironment',
) {}

// ── Stage result types ───────────────────────────────────────────────────

export interface PrepareDone {
  readonly project: Project
  readonly plugins: ComposedPlugins
  readonly loadedPlugins: LoadedPlugins
  readonly ignorers: readonly IgnorerService[]
  readonly options: StrykerOptions
  readonly temporaryDirectoryPath: string
}

export interface InstrumentDone extends PrepareDone {
  readonly mutants: readonly Mutant[]
  readonly sandbox: SandboxHandle
  readonly concurrency: {
    readonly testRunners: number
    readonly checkers: number
  }
}

export interface DryRunDone extends InstrumentDone {
  readonly dryRunResult: CompleteDryRunResult
  readonly testCoverage: TestCoverage
  readonly timeOverhead: Duration.Duration
}

export interface RunOutcome {
  readonly results: readonly MutantResult[]
  readonly verdict: ExitClass | null
}

export interface PrepareExecutorArgs {
  cliOptions: PartialStrykerOptions
  targetMutatePatterns: string[] | undefined
}

// ── Helpers ──────────────────────────────────────────────────────────────

const isRecord = Predicate.isObject
const buildMergedSchema = (
  core: ValidationSchemaDocument,
  contributions: readonly Record<string, unknown>[],
): ValidationSchemaDocument => {
  if (contributions.length === 0) {
    return core
  }
  const merged: Record<string, unknown> = { ...core }
  const corePropsValue = merged['properties']
  const corePropsRecord: Record<string, unknown> = {}
  if (isRecord(corePropsValue)) {
    for (const [k, v] of Object.entries(corePropsValue)) {
      corePropsRecord[k] = v
    }
  }
  for (const contrib of contributions) {
    if (!isRecord(contrib)) {
      continue
    }
    const contribProps = contrib['properties']
    if (!isRecord(contribProps)) {
      continue
    }
    for (const [k, v] of Object.entries(contribProps)) {
      corePropsRecord[k] = v
    }
  }
  merged['properties'] = corePropsRecord
  return merged
}

function buildDryRunFiles(prev: InstrumentDone): { files: string[]; testFiles: string[] | undefined } {
  const files = [...MutableHashMap.keys(prev.project.filesToMutate)].map((name) => prev.sandbox.sandboxFileFor(name))
  let testFiles: string[] | undefined
  if (prev.project.testFiles.length > 0) {
    testFiles = prev.project.testFiles.map((file) => prev.sandbox.sandboxFileFor(file))
  }
  return { files, testFiles }
}
const readCurrentRelativeFiles = (
  project: Project,
  basePath: string,
): Effect.Effect<Record<string, string>, unknown, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const entries = yield* Effect.forEach(
      MutableHashMap.values(project.files),
      (file) =>
        Effect.map(readOriginal(file), (content) =>
          [toRelativeNormalizedFileName(file.name, basePath), content] as const),
      { concurrency: FILE_CONCURRENCY },
    )
    return Object.fromEntries(entries)
  })

const rememberedResultsOf = (
  mutants: readonly Mutant[],
  remembered: readonly {
    readonly mutantId: string
    readonly status: string
    readonly testsCompleted?: number | undefined
    readonly coveredBy?: readonly string[] | undefined
    readonly killedBy?: readonly string[] | undefined
  }[],
): MutantResult[] => {
  const settled: MutantResult[] = []
  for (const entry of remembered) {
    const mutant = mutants.find((candidate) => candidate.id === entry.mutantId)
    if (mutant === undefined) continue
    const extra: { coveredBy?: string[]; killedBy?: string[] } = {}
    if (entry.coveredBy !== undefined) {
      extra.coveredBy = [...entry.coveredBy]
    }
    if (entry.killedBy !== undefined) {
      extra.killedBy = [...entry.killedBy]
    }
    settled.push(
      Object.assign({}, mutant, {
        location: toSchemaLocation(mutant.location),
        status: entry.status,
        statusReason: REMEMBERED_REASON,
        testsCompleted: entry.testsCompleted,
      }, extra),
    )
  }
  return settled
}

const partitionPlans = (
  plans: readonly TestPlan[],
): { coveredPlans: MutantRunPlan[]; earlyResults: MutantResult[] } => {
  const coveredPlans: MutantRunPlan[] = []
  const earlyResults: MutantResult[] = []
  for (const plan of plans) {
    if (plan.plan === 'Run') {
      coveredPlans.push(plan)
      continue
    }
    earlyResults.push(
      Object.assign({}, plan.mutant, {
        location: toSchemaLocation(plan.mutant.location),
        status: plan.mutant.status ?? 'Ignored',
      }),
    )
  }
  return { coveredPlans, earlyResults }
}

const VALID_MUTANT_STATUSES = [
  'Killed',
  'Survived',
  'NoCoverage',
  'Timeout',
  'CompileError',
  'RuntimeError',
  'Ignored',
  'Pending',
] as const
type ValidMutantStatus = typeof VALID_MUTANT_STATUSES[number]
const VALID_MUTANT_STATUS_SET = new Set<string>(VALID_MUTANT_STATUSES)
function isMutantStatus(s: string): s is ValidMutantStatus {
  return VALID_MUTANT_STATUS_SET.has(s)
}

/**
 * The reporting surface wants `coveredBy` and `static` as present keys, which a
 * `Mutant` may omit. Assigned onto a real instance rather than spread into a new
 * object: `Mutant` is a tagged class, so spreading drops its `_tag` and its
 * prototype and the report then carries a plain object claiming to be a mutant.
 */
const toReportedMutant = (mutant: Mutant): MutantTestCoverage =>
  Object.assign(mutant, { coveredBy: mutant.coveredBy, static: mutant.static })

/**
 * A run either configures checkers or it does not, and with none there is no
 * pool to build. Extracted from the mutation-test write body so that body stays
 * inside its branching budget.
 */
const makeCheckerPool = (
  prev: DryRunDone,
  idGenerator: Parameters<typeof createCheckerFactory>[3],
): Effect.Effect<
  Pool.Pool<CheckerResourceService, unknown> | undefined,
  never,
  Scope.Scope | ChildProcessSpawner.ChildProcessSpawner | WorkerLauncher | WorkerEntries
> =>
  Effect.gen(function*() {
    if (prev.options.checkers.length === 0) {
      return undefined
    }
    return yield* Pool.make({
      acquire: createCheckerFactory(
        prev.options,
        prev.project.fileDescriptions,
        prev.loadedPlugins.pluginModulePaths,
        idGenerator,
        prev.sandbox.workingDirectory,
      ),
      size: prev.concurrency.checkers,
    })
  })

const noopReporter: ReporterService = {
  onDryRunCompleted: () => Effect.void,
  onMutationTestingPlanReady: () => Effect.void,
  onMutantTested: () => Effect.void,
  onMutationTestReportReady: () => Effect.void,
  wrapUp: Effect.void,
}

const resolveReporterService = <E>(
  reporters: readonly string[],
  layerOpt: ComposedPlugins['layer'],
  options: StrykerOptions,
  directory: string,
  makeError: (message: string) => E,
): Effect.Effect<ReporterService, E, Scope.Scope | FileSystem.FileSystem | Path.Path | Module> =>
  Effect.gen(function*() {
    if (reporters.length === 0) {
      return noopReporter
    }
    if (Option.isNone(layerOpt)) {
      return yield* Effect.fail(
        makeError(
          `Reporters [${reporters.join(', ')}] configured but no plugin layer is available (no plugins loaded)`,
        ),
      )
    }
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const module = yield* Module
    const ctx = yield* Layer.build(layerOpt.value).pipe(
      Effect.provideService(RunConfiguration, options),
      Effect.provideService(SandboxDirectory, directory),
      Effect.provide(Layer.mergeAll(
        Layer.succeed(FileSystem.FileSystem, fileSystem),
        Layer.succeed(Path.Path, path),
        Layer.succeed(Module, module),
      )),
    )
    const maybeReporter = Context.getOption(ctx, Reporter)
    if (Option.isNone(maybeReporter)) {
      return yield* Effect.fail(
        makeError(
          `Reporter service not found in plugin context; configured reporters: ${reporters.join(', ')}`,
        ),
      )
    }
    return maybeReporter.value
  })
// ── Layer builders ───────────────────────────────────────────────────────

export type StageServices =
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | IdGenerator
  | Module
  | Path.Path
  | RunEnvironment
  | RunEvents
  | Scope.Scope
  | WorkerEntries
  | WorkerLauncher
export type EnginePorts =
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | Module
  | Path.Path
  | WorkerEntries
  | WorkerLauncher
export const runPrepare = (command: PrepareExecutorArgs) =>
  Effect.gen(function*() {
    yield* Scope.Scope
    const env = yield* RunEnvironment
    const queue = yield* RunEvents
    const coreSchema: ValidationSchemaDocument = forkCoreSchema
    const configured = yield* readConfig(
      command.cliOptions,
      env.basePath,
    ).pipe(
      Effect.mapError((cause) => new StageError({ stage: 'prepare', reason: 'Failed to read config', cause })),
      Effect.tapCause(() =>
        Effect.gen(function*() {
          const now = yield* Clock.currentTimeMillis
          yield* Queue.offer(queue, new PhaseEntered({ phase: 'prepare', elapsedMs: now - env.runStartedAt }))
        }).pipe(Effect.ignore)
      ),
    )
    const resolvedReporters = selectReporters([...configured.reporters], env.resolvedMode.mode)
    const options: PrepareDone['options'] = {
      ...configured,
      reporters: resolvedReporters,
      allowConsoleColors: env.allowConsoleColors,
      clearTextReporter: {
        ...configured.clearTextReporter,
        allowColor: env.allowConsoleColors,
      },
    }
    const optionsRecord: Record<string, unknown> = { ...options }
    const pluginsValue = optionsRecord['plugins']
    let pluginsList: string[]
    if (Array.isArray(pluginsValue)) {
      pluginsList = pluginsValue.filter((v): v is string => typeof v === 'string')
    } else {
      pluginsList = []
    }
    const appendPluginsValue = optionsRecord['appendPlugins']
    let appendPluginsList: string[]
    if (Array.isArray(appendPluginsValue)) {
      appendPluginsList = appendPluginsValue.filter((v): v is string => typeof v === 'string')
    } else {
      appendPluginsList = []
    }
    const descriptors: readonly string[] = [...pluginsList, ...appendPluginsList, ...env.reporterPluginModules]
    const loaded = yield* loadPlugins(descriptors, env.basePath).pipe(
      Effect.mapError((cause) => new StageError({ stage: 'prepare', reason: 'Failed to load plugins', cause })),
    )
    const mergedSchema = buildMergedSchema(coreSchema, loaded.schemaContributions)
    if (loaded.schemaContributions.length > 0) {
      const record: Record<string, unknown> = { ...options }
      yield* validateOptions(record, mergedSchema).pipe(
        Effect.mapError(
          (cause) =>
            new StageError({
              stage: 'prepare',
              reason: 'Failed to revalidate options with plugin schema',
              cause,
            }),
        ),
      )
    }
    const project = yield* readProject(options, command.targetMutatePatterns, env.basePath).pipe(
      Effect.mapError((cause) => new StageError({ stage: 'prepare', reason: 'Failed to read project', cause })),
    )
    const mutateCount = MutableHashMap.size(project.filesToMutate)
    const summary = `Found ${mutateCount} of ${MutableHashMap.size(project.files)} file(s) to be mutated.`
    if (env.resolvedMode.mode === 'human') {
      if (env.allowConsoleColors) {
        yield* Console.log(ansi.green(summary))
      } else {
        yield* Console.log(summary)
      }
    } else {
      yield* Effect.logInfo(summary)
    }
    const selectedIgnorers = HashSet.fromIterable(options.ignorers)
    const contributions = yield* createAll(loaded.pluginsByKind, 'Ignore').pipe(
      Effect.map((all) => all.filter((contribution) => HashSet.has(selectedIgnorers, contribution.name))),
      Effect.mapError((cause) => new StageError({ stage: 'prepare', reason: 'Failed to create ignorers', cause })),
    )
    const ignorers: readonly IgnorerService[] = yield* Effect.forEach(
      contributions,
      (contribution) =>
        Effect.gen(function*() {
          const ctx = yield* Layer.build(contribution.layer)
          return Context.get(ctx, Ignorer)
        }).pipe(
          Effect.provideService(RunConfiguration, options),
          Effect.provideService(SandboxDirectory, env.basePath),
        ),
    ).pipe(
      Effect.mapError((cause) => new StageError({ stage: 'prepare', reason: 'Failed to build ignorers', cause })),
    )
    const temporaryDirectoryPath = yield* Effect.gen(function*() {
      const live = TemporaryDirectoryLive(options)
      const service = yield* Effect.service(TemporaryDirectory).pipe(Effect.provide(live))
      return service.path
    }).pipe(
      Effect.mapError((cause) =>
        new StageError({ stage: 'prepare', reason: 'Failed to create temporary directory', cause })
      ),
    )
    const allContributions: readonly AnyPluginContribution[] = (() => {
      const out: Array<AnyPluginContribution> = []
      for (const arr of HashMap.values(loaded.pluginsByKind)) {
        for (const c of arr) {
          out.push(c)
        }
      }
      return out
    })()
    const plugins = composePlugins(allContributions)
    const now = yield* Clock.currentTimeMillis
    yield* Queue.offer(queue, new PhaseEntered({ phase: 'prepare', elapsedMs: now - env.runStartedAt }))
    if (MutableHashMap.size(project.files) === 0) {
      return yield* Effect.fail(
        new StageError({
          stage: 'prepare',
          reason: 'No input files found.',
          cause: new PrepareError({ stage: 'prepare', reason: 'No input files found.' }),
        }),
      )
    }
    return {
      project,
      plugins,
      loadedPlugins: loaded,
      ignorers,
      options,
      temporaryDirectoryPath,
    }
  })

interface InstrumentRaw {
  readonly prev: PrepareDone
  readonly filesToMutate: readonly InstrumenterFile[]
  readonly instrumentResult: InstrumentResult
  readonly instrumentedProject: Project
  readonly sandbox: SandboxHandle
  readonly concurrency: { readonly testRunners: number; readonly checkers: number }
}

export const instrumentCell = Cell.layer({
  read: (command: PrepareDone) =>
    Effect.gen(function*() {
      // raw: InstrumentRaw from PrepareDone
      yield* Scope.Scope
      const env = yield* RunEnvironment

      const filesToMutate = yield* Effect.forEach([...MutableHashMap.values(command.project.filesToMutate)], (file) =>
        toInstrumenterFile(file), {
        concurrency: FILE_CONCURRENCY,
      }).pipe(
        Effect.mapError((cause) =>
          new StageError({ stage: 'instrument', reason: 'Failed to read files to mutate', cause })
        ),
      )

      const instrumentResult = yield* instrument(filesToMutate, {
        ignorers: [...command.ignorers],
        excludedMutations: [...command.options.mutator.excludedMutations],
      }).pipe(Effect.mapError((cause) =>
        new StageError({ stage: 'instrument', reason: 'Instrumenter failed', cause })
      ))

      const instrumentedProject = withInstrumentedFiles(command.project, instrumentResult.files)

      const basePath = env.basePath
      let workingDirectory = command.temporaryDirectoryPath
      let backupDirectory = ''
      if (command.options.inPlace) {
        workingDirectory = basePath
        backupDirectory = command.temporaryDirectoryPath
      }

      const sandbox = yield* makeSandbox({
        options: command.options,
        project: instrumentedProject,
        workingDirectory,
        backupDirectory,
        basePath,
      }).pipe(Effect.mapError((cause) =>
        new StageError({ stage: 'instrument', reason: 'Sandbox initialization failed', cause })
      ))

      const concurrency = yield* makeConcurrency(command.options).pipe(
        Effect.mapError((cause) =>
          new StageError({ stage: 'instrument', reason: 'Failed to compute concurrency', cause })
        ),
      )

      const raw: InstrumentRaw = {
        prev: command,
        filesToMutate,
        instrumentResult,
        instrumentedProject,
        sandbox,
        concurrency,
      }
      return raw
    }),
  decode: (raw: InstrumentRaw): Result.Result<InstrumentCommand, StageError> =>
    Result.succeed(
      new InstrumentCommand({
        fileCount: raw.filesToMutate.length,
        inPlace: raw.prev.options.inPlace,
        pluginCount: raw.prev.loadedPlugins.pluginModulePaths.length,
      }),
    ),
  decide: instrumentWorkflow,
  encode: (outcome) => outcome,
  write: (output, raw) =>
    Effect.gen(function*() {
      const env = yield* RunEnvironment
      const now = yield* Clock.currentTimeMillis
      const queue = yield* RunEvents
      yield* Queue.offer(queue, new PhaseEntered({ phase: 'instrument', elapsedMs: now - env.runStartedAt }))

      const out = output
      if (Result.isFailure(out)) {
        const err = out.failure
        return yield* Effect.fail(new StageError({ stage: err.stage, reason: err.reason, cause: err }))
      }
      return {
        ...raw.prev,
        project: raw.instrumentedProject,
        mutants: raw.instrumentResult.mutants,
        sandbox: raw.sandbox,
        concurrency: {
          testRunners: raw.concurrency.testRunners,
          checkers: raw.concurrency.checkers,
        },
      }
    }),
})

export interface DryRunRaw {
  readonly prev: InstrumentDone
  readonly rawResult: DryRunResult
  readonly capabilities: TestRunnerCapabilities
  readonly gross: Duration.Duration
  readonly reporterService: ReporterService
}

export const dryRunCell = Cell.layer({
  read: (command: InstrumentDone) =>
    Effect.gen(function*() {
      // raw: DryRunRaw from InstrumentDone
      yield* Scope.Scope
      const idGenerator = yield* IdGenerator

      const reporterService: ReporterService = yield* resolveReporterService(
        command.options.reporters,
        command.plugins.layer,
        command.options,
        command.temporaryDirectoryPath,
        (message) => new StageError({ stage: 'dryRun', reason: message }),
      )
      const { files, testFiles } = buildDryRunFiles(command)
      const dryRunTimeout = command.options.dryRunTimeoutMinutes * 60 * 1000

      yield* Effect.logInfo('Starting dry run')
      const { rawResult, capabilities, gross } = yield* Effect.scoped(
        Effect.gen(function*() {
          const childRunnerEffect = makeChildProcessTestRunner({
            options: command.options,
            fileDescriptions: command.project.fileDescriptions,
            sandboxWorkingDirectory: command.sandbox.workingDirectory,
            pluginModulePaths: [...command.loadedPlugins.pluginModulePaths],
            idGenerator,
          })
          const runner = yield* buildTestRunner(
            {
              options: command.options,
              fileDescriptions: command.project.fileDescriptions,
              sandboxWorkingDirectory: command.sandbox.workingDirectory,
              pluginModulePaths: [...command.loadedPlugins.pluginModulePaths],
              idGenerator,
              retire: Effect.void,
            },
            childRunnerEffect,
          )
          const extra: { testFiles?: string[] } = {}
          if (testFiles !== undefined) {
            extra.testFiles = testFiles
          }
          const timed = yield* Effect.timed(
            runner
              .dryRun({
                timeout: dryRunTimeout,
                coverageAnalysis: command.options.coverageAnalysis,
                disableBail: command.options.disableBail,
                files,
                ...extra,
              })
              .pipe(
                Effect.mapError((cause) => new StageError({ stage: 'dryRun', reason: 'Dry run failed', cause })),
              ),
          )
          const gross: Duration.Duration = timed[0]
          const rawResult = timed[1]
          const capabilities = yield* runner.capabilities.pipe(
            Effect.mapError((cause) =>
              new StageError({ stage: 'dryRun', reason: 'Failed to get test runner capabilities', cause })
            ),
          )
          return { rawResult, capabilities, gross }
        }),
      ).pipe(
        Effect.mapError((cause) => {
          if (cause instanceof StageError) {
            return cause
          }
          return new StageError({ stage: 'dryRun', reason: 'Dry run failed to start test runner', cause })
        }),
      )

      const normalizedRawResult = rawResult
      const raw: DryRunRaw = {
        prev: command,
        rawResult: normalizedRawResult,
        capabilities,
        gross,
        reporterService,
      }
      return raw
    }),
  decode: (raw: DryRunRaw): Result.Result<DryRunCommand, StageError> => {
    const rawResult = raw.rawResult
    const allowEmpty = raw.prev.options.allowEmpty
    if (rawResult.status === 'complete') {
      const failedTestCount = rawResult.tests.filter((test) => test.status === 'failed').length
      return Result.succeed(
        new DryRunCommand({
          status: 'Complete',
          testCount: rawResult.tests.length,
          failedTestCount,
          allowEmpty,
        }),
      )
    }
    if (rawResult.status === 'error') {
      return Result.succeed(
        new DryRunCommand({
          status: 'Error',
          testCount: 0,
          failedTestCount: 0,
          allowEmpty,
          errorMessage: rawResult.errorMessage,
        }),
      )
    }
    return Result.succeed(
      new DryRunCommand({
        status: 'Timeout',
        testCount: 0,
        failedTestCount: 0,
        allowEmpty,
        ...(rawResult.reason !== undefined && { reason: rawResult.reason }),
      }),
    )
  },
  decide: dryRunWorkflow,
  encode: (outcome) => outcome,
  write: (outcome, raw) =>
    Effect.gen(function*() {
      const env = yield* RunEnvironment
      const now = yield* Clock.currentTimeMillis
      const queue = yield* RunEvents
      yield* Queue.offer(queue, new PhaseEntered({ phase: 'dry-run', elapsedMs: now - env.runStartedAt }))

      const out = outcome
      if (Result.isFailure(out)) {
        const err = out.failure
        return yield* Effect.fail(new StageError({ stage: err.stage, reason: err.reason, cause: err }))
      }
      return yield* Match.value(out.success).pipe(
        Match.tag('DryRunFailed', (decision) =>
          Effect.fail(
            new StageError({
              stage: 'dryRun',
              reason: 'There were failed tests in the initial test run.',
              cause: decision,
            }),
          )),
        Match.tag('DryRunPassed', () =>
          Effect.gen(function*() {
            const prevDone = raw.prev
            const rawResult = raw.rawResult

            if (rawResult.status !== 'complete') {
              return yield* Effect.fail(
                new StageError({ stage: 'dryRun', reason: 'Unexpected dry-run status after decision' }),
              )
            }
            const tests = rawResult.tests.map((test) => {
              if (test.fileName !== undefined) {
                return { ...test, fileName: prevDone.sandbox.originalFileFor(test.fileName) }
              }
              return test
            })
            const dryRunResult: CompleteDryRunResult = { ...rawResult, tests, status: 'complete' }

            const net = tests.reduce((total, test) => total + test.timeSpentMs, 0)
            const grossMillis = Duration.toMillis(raw.gross)
            let overheadMillis = grossMillis - net
            if (overheadMillis < 0) {
              overheadMillis = 0
            }
            const overhead = Duration.millis(overheadMillis)

            const testCoverage = testCoverageFrom(dryRunResult)

            yield* raw.reporterService.onDryRunCompleted({
              result: dryRunResult,
              timing: { net, overhead: overheadMillis },
              capabilities: raw.capabilities,
            }).pipe(Effect.ignoreCause)

            if (tests.length === 0) {
              yield* Effect.logInfo('No tests were found')
            } else {
              yield* Effect.logInfo(
                `Initial test run succeeded. Ran ${tests.length} tests in ${Duration.format(raw.gross)} (net ${
                  tests.reduce((t, x) => t + x.timeSpentMs, 0)
                } ms, overhead ${overheadMillis} ms).`,
              )
              if (prevDone.options.dryRunOnly) {
                yield* Effect.logInfo('Note: running the dry-run only. No mutations will be tested.')
              }
            }

            return {
              ...prevDone,
              dryRunResult,
              testCoverage,
              timeOverhead: overhead,
            }
          })),
        Match.exhaustive,
      )
    }),
})

interface MutationTestRaw {
  readonly prev: DryRunDone
}

export const mutationTestCell: Cell.Cell<DryRunDone, RunOutcome, StageError, StageServices> = Cell.layer({
  read: (command: DryRunDone): Effect.Effect<MutationTestRaw, never, Scope.Scope> =>
    Effect.gen(function*() {
      yield* Scope.Scope
      const prev = command
      const raw: MutationTestRaw = { prev }
      return raw
    }),
  decode: (raw: MutationTestRaw): Result.Result<MutationTestCommand, StageError> =>
    Result.succeed(
      new MutationTestCommand({
        dryRunOnly: raw.prev.options.dryRunOnly,
        allowEmpty: raw.prev.options.allowEmpty,
        testCount: raw.prev.dryRunResult.tests.length,
        isZero: raw.prev.dryRunResult.tests.length === 0,
      }),
    ),
  decide: mutationTestWorkflow,
  encode: (outcome) => outcome,
  write: (
    outcome: Result.Result<MutationTestDecision, MutationTestError>,
    raw: MutationTestRaw,
  ): Effect.Effect<RunOutcome, StageError, StageServices> =>
    Effect.gen(function*() {
      const decision = yield* Result.match(outcome, {
        onFailure: (err) => Effect.fail(new StageError({ stage: err.stage, reason: err.reason, cause: err })),
        onSuccess: (d) => Effect.succeed(d),
      })
      return yield* Match.value(decision).pipe(
        Match.tag('MutationTestDryRunOnly', () =>
          Effect.gen(function*() {
            const env = yield* RunEnvironment
            const queue = yield* RunEvents
            const nowEmit = yield* Clock.currentTimeMillis
            yield* Queue.offer(
              queue,
              new PhaseEntered({ phase: 'mutation-test', elapsedMs: nowEmit - env.runStartedAt }),
            )
            yield* Effect.logInfo('The dry-run has been completed successfully. No mutations have been executed.')
            const emptyOutcome: RunOutcome = { results: [], verdict: null }
            return emptyOutcome
          })),
        Match.tag('MutationTestNoTests', () =>
          Effect.gen(function*() {
            const env = yield* RunEnvironment
            const queue = yield* RunEvents
            const now = yield* Clock.currentTimeMillis
            const elapsed = Duration.millis(now - env.runStartedAt)
            yield* Effect.logInfo(`Done in ${Duration.format(elapsed)}.`)
            const nowEmit = yield* Clock.currentTimeMillis
            yield* Queue.offer(
              queue,
              new PhaseEntered({ phase: 'mutation-test', elapsedMs: nowEmit - env.runStartedAt }),
            )
            const emptyOutcome: RunOutcome = { results: [], verdict: null }
            return emptyOutcome
          })),
        Match.tag('MutationTestProceed', () =>
          Effect.gen(function*() {
            const prev = raw.prev
            const env = yield* RunEnvironment
            const reporterService: ReporterService = yield* resolveReporterService(
              prev.options.reporters,
              prev.plugins.layer,
              prev.options,
              prev.temporaryDirectoryPath,
              (message) => new StrykerError({ message }),
            )
            const emitPhase = Effect.gen(function*() {
              const nowEmit = yield* Clock.currentTimeMillis
              const queue = yield* RunEvents
              yield* Queue.offer(
                queue,
                new PhaseEntered({ phase: 'mutation-test', elapsedMs: nowEmit - env.runStartedAt }),
              )
            })
            yield* emitPhase
            const idGenerator = yield* IdGenerator
            const checkerPool = yield* makeCheckerPool(prev, idGenerator)
            const testRunnerContext = {
              options: prev.options,
              fileDescriptions: prev.project.fileDescriptions,
              sandboxWorkingDirectory: prev.sandbox.workingDirectory,
              pluginModulePaths: [...prev.loadedPlugins.pluginModulePaths],
              idGenerator: idGenerator,
              retire: Effect.void,
            }
            const testRunnerPool: Pool.Pool<PooledTestRunner, unknown> = yield* Pool.make({
              acquire: buildTestRunner(
                testRunnerContext,
                makeChildProcessTestRunner({
                  options: prev.options,
                  fileDescriptions: prev.project.fileDescriptions,
                  sandboxWorkingDirectory: prev.sandbox.workingDirectory,
                  pluginModulePaths: [...prev.loadedPlugins.pluginModulePaths],
                  idGenerator: idGenerator,
                }),
              ),
              size: prev.concurrency.testRunners,
            })
            const reporting = makeMutationReportingService({
              reporter: reporterService,
              options: prev.options,
              project: prev.project,
              testCoverage: prev.testCoverage,
              runId: env.runId,
              resolvedMode: env.resolvedMode,
              pluginsByKind: prev.loadedPlugins.pluginsByKind,
              sandboxDirectory: prev.sandbox.workingDirectory,
              basePath: env.basePath,
            })
            const sandboxFileByName: Record<string, string> = {}
            for (const name of MutableHashMap.keys(prev.project.filesToMutate)) {
              sandboxFileByName[name] = prev.sandbox.sandboxFileFor(name)
            }
            const currentRelativeFiles = yield* readCurrentRelativeFiles(prev.project, env.basePath)
            const incremental = incrementalDiff({
              currentMutants: prev.mutants,
              testCoverage: prev.testCoverage,
              incrementalReport: prev.project.incrementalReport,
              currentRelativeFiles,
              basePath: env.basePath,
              force: prev.options.force,
            })
            const rememberedResults = rememberedResultsOf(prev.mutants, incremental.remembered)
            if (rememberedResults.length > 0) {
              yield* Effect.logInfo(
                `Incremental mode: reusing ${rememberedResults.length} mutant result(s), running ${incremental.mutants.length} mutant(s).`,
              )
            }
            const { coveredPlans, earlyResults: noCoverageResults } = partitionPlans(
              yield* decidePlans(
                incremental.mutants,
                prev.testCoverage,
                {
                  disableBail: prev.options.disableBail,
                  timeoutMS: prev.options.timeoutMS,
                  timeoutFactor: prev.options.timeoutFactor,
                  ignoreStatic: prev.options.ignoreStatic,
                },
                Duration.toMillis(prev.timeOverhead),
                undefined,
                sandboxFileByName,
              ),
            )
            const sortedPlans = [...coveredPlans].sort((a, b) => {
              if (a.runOptions.reloadEnvironment === b.runOptions.reloadEnvironment) return 0
              if (a.runOptions.reloadEnvironment) return 1
              return -1
            })
            const allPlansForReporter: readonly MutantRunPlan[] = [...sortedPlans]
            yield* reporterService.onMutationTestingPlanReady({ mutantPlans: allPlansForReporter }).pipe(
              Effect.ignoreCause,
            )
            {
              const queue2 = yield* RunEvents
              yield* Queue.offer(
                queue2,
                new PlanKnown({ total: allPlansForReporter.length + noCoverageResults.length }),
              )
            }
            let passedPlans: readonly MutantRunPlan[] = sortedPlans
            if (checkerPool !== undefined) {
              for (const checkerName of prev.options.checkers) {
                const checked = yield* Effect.scoped(
                  Effect.flatMap(
                    Pool.get(checkerPool),
                    (checker) =>
                      checkGroupedPlans(checker, checkerName, passedPlans).pipe(
                        Effect.catchTags({
                          OutOfMemoryError: (error) =>
                            Effect.flatMap(Pool.invalidate(checkerPool, checker), () => Effect.fail(error)),
                          ChildProcessCrashedError: (error) =>
                            Effect.flatMap(Pool.invalidate(checkerPool, checker), () => Effect.fail(error)),
                        }),
                      ),
                  ),
                )
                const kept: MutantRunPlan[] = []
                for (const [plan, result] of checked) {
                  if (result.status === 'passed') {
                    kept.push(plan)
                    continue
                  }
                  yield* reporting.reportCheckFailure(toReportedMutant(plan.mutant), result)
                }
                passedPlans = kept
              }
            }
            const testRunnerStream = Stream.fromIterable(passedPlans)
            const plannedTotal = allPlansForReporter.length + noCoverageResults.length + rememberedResults.length
            const pathService = yield* Path.Path
            const progressQueue = yield* RunEvents
            const completedRef = yield* Ref.make(0)
            const offerFinished = (result: MutantResult) =>
              Effect.gen(function*() {
                const rawStatus: string = result.status
                if (!isMutantStatus(rawStatus)) {
                  return
                }
                const completed = yield* Ref.updateAndGet(completedRef, (n) => n + 1)
                yield* Queue.offer(
                  progressQueue,
                  new MutantTested({
                    id: result.id,
                    status: rawStatus,
                    file: normalizeReportFileName(env.basePath, result.fileName, pathService),
                    location: toSchemaLocation(result.location),
                    mutator: result.mutatorName,
                    replacement: result.replacement,
                    completed,
                    total: plannedTotal,
                  }),
                )
              })
            for (const result of [...rememberedResults, ...noCoverageResults]) {
              yield* offerFinished(result)
              yield* reporterService.onMutantTested(result).pipe(
                Effect.catchCause((cause) => Effect.logWarning('Reporter failed handling onMutantTested', cause)),
              )
            }
            const completedMutants = yield* Ref.make<MutantResult[]>([...rememberedResults, ...noCoverageResults])
            const checkpointGate = yield* Semaphore.make(1)
            yield* reporting.checkpoint(yield* Ref.get(completedMutants)).pipe(
              Effect.catchCause((cause) => Effect.logWarning('Reporter failed handling onMutantTested', cause)),
            )
            const persist = (result: MutantResult) =>
              checkpointGate.withPermits(1)(
                Effect.gen(function*() {
                  const next = yield* Ref.updateAndGet(completedMutants, (prev) => [...prev, result])
                  yield* reporting.checkpoint(next).pipe(
                    Effect.catchCause((cause) => Effect.logWarning('Reporter failed handling onMutantTested', cause)),
                  )
                }),
              )
            const runResults: MutantResult[] = yield* Stream.mapEffect(
              testRunnerStream,
              (plan) =>
                Effect.scoped(
                  Effect.gen(function*() {
                    const pool = testRunnerPool
                    const runner = yield* Pool.get(pool)
                    const result = yield* runner.mutantRun(plan.runOptions).pipe(
                      Effect.catchTags({
                        OutOfMemoryError: (error) =>
                          Effect.flatMap(Pool.invalidate(pool, runner), () => Effect.fail(error)),
                        ChildProcessCrashedError: (error) =>
                          Effect.flatMap(Pool.invalidate(pool, runner), () => Effect.fail(error)),
                      }),
                    )
                    const reported = yield* reporting.reportMutantRunResult(toReportedMutant(plan.mutant), result)
                    yield* offerFinished(reported)
                    yield* persist(reported)
                    return reported
                  }),
                ),
              { concurrency: Math.max(1, prev.concurrency.testRunners) },
            ).pipe(Stream.runCollect, Effect.map((chunk) => [...chunk]))
            const allResults: MutantResult[] = [...rememberedResults, ...noCoverageResults, ...runResults]
            const outcomeResult = yield* reporting.reportAll(allResults)
            yield* reporterService.wrapUp.pipe(
              Effect.catchCause((cause) => Effect.logWarning('Reporter failed handling wrapUp', cause)),
            )
            const doneNow = yield* Clock.currentTimeMillis
            const elapsed = Duration.millis(doneNow - env.runStartedAt)
            yield* Effect.logInfo(`Done in ${Duration.format(elapsed)}.`)
            const finalOutcome: RunOutcome = outcomeResult
            return finalOutcome
          })),
        Match.exhaustive,
      )
    }).pipe(
      Effect.mapError((cause) => {
        if (cause instanceof StageError) {
          return cause
        }
        return new StageError({ stage: 'mutationTest', reason: 'Mutation testing failed', cause })
      }),
    ),
})
export const makeRunLayer = (
  env: RunEnvironmentShape,
  events?: Queue.Queue<RunEvent, Cause.Done>,
): Layer.Layer<RunEnvironment | RunEvents | IdGenerator | Scope.Scope, never, EnginePorts> => {
  const eventsLayer: Layer.Layer<RunEvents> = Match.value(events).pipe(
    Match.when(undefined, () => Layer.effect(RunEvents, Queue.unbounded<RunEvent, Cause.Done>())),
    Match.orElse((queue) => Layer.succeed(RunEvents, queue)),
  )
  return Layer.mergeAll(
    Layer.succeed(RunEnvironment, env),
    eventsLayer,
    idGeneratorLayer,
    Layer.effect(
      Scope.Scope,
      Effect.gen(function*() {
        const stageScope = yield* Scope.make()
        yield* Effect.addFinalizer(() => Scope.close(stageScope, Exit.void))
        return stageScope
      }),
    ),
  )
}
/**
 * The pipeline runs prepare as a plain stage, then the deciding cells.
 */
export const runMutationTest = (
  cliOptions: PartialStrykerOptions,
  targetMutatePatterns?: string[],
): Effect.Effect<RunOutcome, StageError, StageServices> =>
  Effect.gen(function*() {
    const prepared = yield* runPrepare({ cliOptions, targetMutatePatterns })
    const instrumented = yield* Cell.run(instrumentCell, prepared)
    const dryDone = yield* Cell.run(dryRunCell, instrumented)
    return yield* Cell.run(mutationTestCell, dryDone)
  })
export const shouldKeepTempDir = (
  exit: Exit.Exit<unknown, unknown>,
  cleanTempDir: 'always' | boolean,
): boolean => Exit.isFailure(exit) && cleanTempDir !== 'always'
