import { Cell } from '@systemfsoftware/effect-cell-types'
import type { CheckResult, PassedCheckResult } from '@systemfsoftware/stryker-js/Checker'
import type { ExitClass } from '@systemfsoftware/stryker-js/ExitClass'
import type { Location, Mutant } from '@systemfsoftware/stryker-js/Mutant'
import type { MutantResult } from '@systemfsoftware/stryker-js/Mutant'
import type { MutantTestCoverage } from '@systemfsoftware/stryker-js/Mutant'
import type { RunPlan as MutantRunPlan } from '@systemfsoftware/stryker-js/Mutant'
import type { TestPlan } from '@systemfsoftware/stryker-js/Mutant'
import type { PartialStrykerOptions, StrykerOptions } from '@systemfsoftware/stryker-js/Options'
import type { AnyPluginContribution } from '@systemfsoftware/stryker-js/Plugin'
import type { MutantTested as ReporterMutantTested, ReporterFactory } from '@systemfsoftware/stryker-js/Reporter'
import type {
  CompleteDryRunResult,
  DryRunResult,
  TestResult,
  TestRunnerCapabilities,
} from '@systemfsoftware/stryker-js/TestRunner'
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
import { instrument } from '../instrument/index.js'
import type { File as InstrumenterFile, InstrumentResult } from '../instrument/index.js'
import type { ParserContribution } from '../instrument/Parser.js'
import type { InstrumentIgnorer } from '../instrument/Transformer.js'
import { Module } from './Module.js'
import { PhaseEntered } from './RunEvent.js'
import { MutantTested } from './RunEvent.js'
import { PlanKnown } from './RunEvent.js'
import type { RunEvent } from './RunEvent.js'
import { RunEvents } from './RunEvent.js'

import { makeBuiltinReporterFactories } from '../report/builtin-reporters.js'
import { ansi } from '../report/Reporter.ansi.js'
import {
  attachReporterFactories,
  currentReporterInit,
  offerReporterEvent,
  type ReporterStage,
  validateReporterNames,
  withPhaseSpan,
} from '../report/ReporterStream.js'
import { selectReporters } from '../report/select-reporters.js'
import { admitMutationTest, MutationTestError } from './admit-mutation-test.workflow.js'
import type { MutationTestDecision } from './admit-mutation-test.workflow.js'
import type { CheckerResourceService } from './Checker.js'
import { checkGroupedPlans, createCheckerFactory } from './Checker.js'
import { forkCoreSchema, readConfig, validateOptions, type ValidationSchemaDocument } from './Config.js'
import { dryRun, DryRunCommand } from './dry-run.workflow.js'
import { REMEMBERED_REASON, toRelativeNormalizedFileName } from './IncrementalDiff.paths.js'
import { toSchemaLocation } from './mutant-result-mapping.js'
import { decidePlans, incrementalDiff } from './Mutants.js'
import type { TestCoverage } from './Mutants.js'
import { testCoverageFrom } from './Mutants.js'
import { makeMutationReportingService, type MutationReportingService } from './mutation-reporting.js'
import { MutationTestCommand } from './MutationTest.schema.js'
import type { ResolvedMode } from './output-mode.js'
import { InstrumentCommand, planInstrumentation } from './plan-instrumentation.workflow.js'
import { ignorerOf, parserContributionsOf } from './plugin-adapters.js'
import { composePlugins, createAll } from './Plugins.js'
import { loadPlugins } from './Plugins.js'
import type { ComposedPlugins, LoadedPlugins } from './Plugins.js'
import type { Project } from './Project.js'
import { readProject } from './Project.js'
import { FILE_CONCURRENCY, readOriginal, toInstrumenterFile } from './Project.js'
import { withInstrumentedFiles } from './Project.js'
import { reportFileName } from './report-assembly.js'
import { PrepareError, StageError } from './Run.schema.js'
import { makeSandbox } from './Sandbox.js'
import type { SandboxHandle } from './Sandbox.js'
import { TemporaryDirectory } from './Sandbox.js'
import { TemporaryDirectoryLive } from './Sandbox.js'
import { buildTestRunner } from './TestRunner.js'
import { makeChildProcessTestRunner } from './TestRunner.js'
import type { PooledTestRunner } from './TestRunner.js'
import { makeConcurrency } from './Worker.js'
import { IdGenerator } from './Worker.js'
import type { IdGeneratorShape } from './Worker.js'
import { layer as idGeneratorLayer } from './Worker.js'
import { WorkerEntries, WorkerLauncher } from './WorkerLauncher.js'

export interface RunEnvironmentShape {
  readonly runId: string
  readonly resolvedMode: ResolvedMode
  readonly runStartedAt: number
  readonly basePath: string
  readonly reporterPluginModules: readonly string[]
  readonly allowConsoleColors: boolean
}

export class RunEnvironment extends Context.Service<RunEnvironment, RunEnvironmentShape>()(
  '@systemfsoftware/stryker-js-cli/run/RunEnvironment',
) {}

export interface PrepareDone {
  readonly project: Project
  readonly plugins: ComposedPlugins
  readonly loadedPlugins: LoadedPlugins
  readonly ignorers: readonly InstrumentIgnorer[]
  readonly parsers: readonly ParserContribution[]
  readonly options: StrykerOptions
  readonly temporaryDirectoryPath: string
  readonly reporterStage: ReporterStage
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

const isRecord = Predicate.isObject

const asRecord = (value: unknown): Record<string, unknown> =>
  Match.value(value).pipe(
    Match.when(isRecord, (record) => Object.fromEntries(Object.entries(record))),
    Match.orElse((): Record<string, unknown> => ({})),
  )

const schemaPropertiesOf = (document: unknown): Record<string, unknown> => asRecord(asRecord(document)['properties'])

const buildMergedSchema = (
  core: ValidationSchemaDocument,
  contributions: readonly Record<string, unknown>[],
): ValidationSchemaDocument =>
  Match.value(contributions.length === 0).pipe(
    Match.when(true, (): ValidationSchemaDocument => core),
    Match.orElse((): ValidationSchemaDocument => ({
      ...core,
      properties: Object.assign(
        {},
        schemaPropertiesOf(core),
        ...contributions.map((contribution) => schemaPropertiesOf(contribution)),
      ),
    })),
  )

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

interface RememberedMutantResult {
  readonly mutantId: string
  readonly status: string
  readonly testsCompleted?: number | undefined
  readonly coveredBy?: readonly string[] | undefined
  readonly killedBy?: readonly string[] | undefined
}

const rememberedCoveredBy = (entry: RememberedMutantResult): { readonly coveredBy?: readonly string[] } =>
  Option.match(Option.fromNullishOr(entry.coveredBy), {
    onNone: (): { readonly coveredBy?: readonly string[] } => ({}),
    onSome: (coveredBy) => ({ coveredBy: [...coveredBy] }),
  })

const rememberedKilledBy = (entry: RememberedMutantResult): { readonly killedBy?: readonly string[] } =>
  Option.match(Option.fromNullishOr(entry.killedBy), {
    onNone: (): { readonly killedBy?: readonly string[] } => ({}),
    onSome: (killedBy) => ({ killedBy: [...killedBy] }),
  })

const rememberedCoverage = (entry: RememberedMutantResult): {
  readonly coveredBy?: readonly string[]
  readonly killedBy?: readonly string[]
} => ({
  ...rememberedCoveredBy(entry),
  ...rememberedKilledBy(entry),
})

const rememberedResultOf = (mutant: Mutant, entry: RememberedMutantResult): MutantResult =>
  Object.assign(
    {},
    mutant,
    {
      location: toSchemaLocation(mutant.location),
      status: entry.status,
      statusReason: REMEMBERED_REASON,
      testsCompleted: entry.testsCompleted,
    },
    rememberedCoverage(entry),
  )

const rememberedResultsOf = (
  mutants: readonly Mutant[],
  remembered: readonly RememberedMutantResult[],
): MutantResult[] => {
  const byId = new Map(mutants.map((mutant) => [mutant.id, mutant] as const))
  return remembered.flatMap((entry) =>
    Option.match(Option.fromNullishOr(byId.get(entry.mutantId)), {
      onNone: (): MutantResult[] => [],
      onSome: (mutant) => [rememberedResultOf(mutant, entry)],
    })
  )
}

type EarlyPlan = Exclude<TestPlan, MutantRunPlan>

const isRunPlan = (plan: TestPlan): plan is MutantRunPlan => plan.plan === 'Run'

const earlyResultOf = (plan: EarlyPlan): MutantResult =>
  Object.assign({}, plan.mutant, {
    location: toSchemaLocation(plan.mutant.location),
    status: plan.mutant.status ?? 'Ignored',
  })

const collectPlan = (
  plan: TestPlan,
  coveredPlans: MutantRunPlan[],
  earlyResults: MutantResult[],
): void =>
  Match.value(plan).pipe(
    Match.when(isRunPlan, (runPlan) => {
      coveredPlans.push(runPlan)
    }),
    Match.orElse((earlyPlan) => {
      earlyResults.push(earlyResultOf(earlyPlan))
    }),
  )

const partitionPlans = (
  plans: readonly TestPlan[],
): { coveredPlans: MutantRunPlan[]; earlyResults: MutantResult[] } => {
  const coveredPlans: MutantRunPlan[] = []
  const earlyResults: MutantResult[] = []
  plans.forEach((plan) => collectPlan(plan, coveredPlans, earlyResults))
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

const toReportedMutant = (mutant: Mutant): MutantTestCoverage =>
  Object.assign(mutant, { coveredBy: mutant.coveredBy, static: mutant.static })

const makeCheckerPool = (
  prev: DryRunDone,
  idGenerator: IdGeneratorShape,
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
        idGenerator,
        prev.sandbox.workingDirectory,
      ),
      size: prev.concurrency.checkers,
    })
  })

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
interface ReporterEntry {
  readonly name: string
  readonly factory: ReporterFactory
}

const stringListOf = (value: unknown): readonly string[] =>
  Match.value(value).pipe(
    Match.when(Array.isArray, (entries) => entries.filter(Predicate.isString)),
    Match.orElse((): readonly string[] => []),
  )

const announceSummary = (env: RunEnvironmentShape, summary: string): Effect.Effect<void> =>
  Match.value(env.resolvedMode.mode).pipe(
    Match.when('human', () => announceHumanSummary(env.allowConsoleColors, summary)),
    Match.orElse(() => Effect.logInfo(summary)),
  )

const announceHumanSummary = (allowConsoleColors: boolean, summary: string): Effect.Effect<void> =>
  Match.value(allowConsoleColors).pipe(
    Match.when(true, () => Console.log(ansi.green(summary))),
    Match.orElse(() => Console.log(summary)),
  )

const selectReporter = (
  chosen: Map<string, ReporterEntry>,
  name: string,
  factoriesByName: HashMap.HashMap<string, ReporterEntry>,
): void =>
  Option.match(HashMap.get(factoriesByName, name.toLowerCase()), {
    onNone: () => undefined,
    onSome: (entry) => {
      if (!chosen.has(entry.name)) {
        chosen.set(entry.name, entry)
      }
    },
  })

const reporterSelectionsOf = (
  names: readonly string[],
  factoriesByName: HashMap.HashMap<string, ReporterEntry>,
): readonly ReporterEntry[] => {
  const chosen = new Map<string, ReporterEntry>()
  names.forEach((name) => selectReporter(chosen, name, factoriesByName))
  return [...chosen.values()]
}

export const runPrepare = (command: PrepareExecutorArgs) =>
  withPhaseSpan(
    'prepare',
    {},
    (span) =>
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
        const pluginsList = stringListOf(optionsRecord['plugins'])
        const appendPluginsList = stringListOf(optionsRecord['appendPlugins'])
        const descriptors: readonly string[] = [...pluginsList, ...appendPluginsList, ...env.reporterPluginModules]
        const loaded = yield* loadPlugins(descriptors, env.basePath).pipe(
          Effect.mapError((cause) => new StageError({ stage: 'prepare', reason: 'Failed to load plugins', cause })),
        )
        const mergedSchema = buildMergedSchema(coreSchema, loaded.schemaContributions)
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
        const project = yield* readProject(options, command.targetMutatePatterns, env.basePath).pipe(
          Effect.mapError((cause) => new StageError({ stage: 'prepare', reason: 'Failed to read project', cause })),
        )
        const mutateCount = MutableHashMap.size(project.filesToMutate)
        const summary = `Found ${mutateCount} of ${MutableHashMap.size(project.files)} file(s) to be mutated.`
        yield* announceSummary(env, summary)
        const selectedIgnorers = HashSet.fromIterable(options.ignorers)
        const contributions = yield* createAll(loaded.pluginsByKind, 'Ignorer').pipe(
          Effect.map((all) => all.filter((contribution) => HashSet.has(selectedIgnorers, contribution.name))),
          Effect.mapError((cause) => new StageError({ stage: 'prepare', reason: 'Failed to create ignorers', cause })),
        )
        const parserContributions = yield* createAll(loaded.pluginsByKind, 'Parser').pipe(
          Effect.mapError((cause) => new StageError({ stage: 'prepare', reason: 'Failed to create parsers', cause })),
        )
        const { ignorers, parsers } = yield* Effect.try({
          try: () => ({
            ignorers: contributions.map((contribution) => ignorerOf(contribution, options)),
            parsers: parserContributionsOf(parserContributions, options),
          }),
          catch: (cause) => new StageError({ stage: 'prepare', reason: 'Failed to build ignorers', cause }),
        })
        const temporaryDirectoryPath = yield* Effect.gen(function*() {
          const live = TemporaryDirectoryLive(options)
          const service = yield* Effect.service(TemporaryDirectory).pipe(Effect.provide(live))
          return service.path
        }).pipe(
          Effect.mapError((cause) =>
            new StageError({ stage: 'prepare', reason: 'Failed to create temporary directory', cause })
          ),
        )
        const builtinReporterFactories = makeBuiltinReporterFactories({
          fileSystem: yield* FileSystem.FileSystem,
          path: yield* Path.Path,
        })
        const allContributions: readonly AnyPluginContribution[] = Array.from(
          HashMap.values(loaded.pluginsByKind),
        ).flat()
        const plugins = composePlugins(allContributions)
        const reporterEntries: readonly (readonly [string, ReporterEntry])[] = [
          ...Object.entries(builtinReporterFactories).map(([name, factory]) =>
            [name.toLowerCase(), { name, factory }] as const
          ),
          ...plugins.reporterFactories.map((candidate) =>
            [candidate.name.toLowerCase(), { name: candidate.name, factory: candidate.factory }] as const
          ),
        ]
        const reporterFactoriesByName = HashMap.fromIterable(reporterEntries)
        const availableReporterNames = [...HashMap.values(reporterFactoriesByName)].map((entry) => entry.name)
        yield* validateReporterNames(configured.reporters, availableReporterNames).pipe(
          Effect.mapError((cause) => new StageError({ stage: 'prepare', reason: cause.message, cause })),
        )
        const reporterInputs = reporterSelectionsOf(options.reporters, reporterFactoriesByName)
        const reporterInit = currentReporterInit(span)
        const attachments = yield* attachReporterFactories(reporterInputs, options, reporterInit)
        const now = yield* Clock.currentTimeMillis
        yield* Queue.offer(queue, new PhaseEntered({ phase: 'prepare', elapsedMs: now - env.runStartedAt }))
        const reporterStage: ReporterStage = { attachments }
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
          parsers,
          options,
          temporaryDirectoryPath,
          reporterStage,
        }
      }),
  )

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
        parsers: [...command.parsers],
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
        parsers: command.parsers,
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
        pluginCount: HashMap.size(raw.prev.loadedPlugins.pluginsByKind),
      }),
    ),
  decide: planInstrumentation,
  encode: (outcome) => outcome,
  write: (output, raw) =>
    withPhaseSpan(
      'instrument',
      { fileCount: raw.filesToMutate.length },
      () =>
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
    ),
})

export interface DryRunRaw {
  readonly prev: InstrumentDone
  readonly rawResult: DryRunResult
  readonly capabilities: TestRunnerCapabilities
  readonly gross: Duration.Duration
}

type FailedDryRun = Extract<DryRunResult, { readonly status: 'error' }>
type TimedOutDryRun = Extract<DryRunResult, { readonly status: 'timeout' }>

const isCompleteDryRun = (result: DryRunResult): result is CompleteDryRunResult => result.status === 'complete'

const isFailedDryRun = (result: DryRunResult): result is FailedDryRun => result.status === 'error'

const decodeCompleteDryRun = (
  result: CompleteDryRunResult,
  allowEmpty: boolean,
): Result.Result<DryRunCommand, StageError> =>
  Result.succeed(
    new DryRunCommand({
      status: 'Complete',
      testCount: result.tests.length,
      failedTestCount: result.tests.filter((test) => test.status === 'failed').length,
      allowEmpty,
    }),
  )

const decodeFailedDryRun = (
  result: FailedDryRun,
  allowEmpty: boolean,
): Result.Result<DryRunCommand, StageError> =>
  Result.succeed(
    new DryRunCommand({
      status: 'Error',
      testCount: 0,
      failedTestCount: 0,
      allowEmpty,
      errorMessage: result.errorMessage,
    }),
  )

const decodeTimedOutDryRun = (
  result: TimedOutDryRun,
  allowEmpty: boolean,
): Result.Result<DryRunCommand, StageError> =>
  Result.succeed(
    new DryRunCommand({
      status: 'Timeout',
      testCount: 0,
      failedTestCount: 0,
      allowEmpty,
      ...(result.reason !== undefined && { reason: result.reason }),
    }),
  )

const totalTestTime = (tests: readonly TestResult[]): number =>
  tests.reduce((total, test) => total + test.timeSpentMs, 0)

const overheadMillisOf = (grossMillis: number, tests: readonly TestResult[]): number =>
  Math.max(0, grossMillis - totalTestTime(tests))

const withOriginalFileName = (test: TestResult, prev: InstrumentDone): TestResult =>
  Match.value(test.fileName).pipe(
    Match.when(Predicate.isString, (fileName) => ({
      ...test,
      fileName: prev.sandbox.originalFileFor(fileName),
    })),
    Match.orElse(() => test),
  )

const withOriginalFileNames = (tests: readonly TestResult[], prev: InstrumentDone): readonly TestResult[] =>
  tests.map((test) => withOriginalFileName(test, prev))

const announceDryRunOutcome = (
  tests: readonly TestResult[],
  prev: InstrumentDone,
  gross: Duration.Duration,
  overheadMillis: number,
): Effect.Effect<void> =>
  Match.value(tests.length).pipe(
    Match.when(0, () => Effect.logInfo('No tests were found')),
    Match.orElse(() =>
      Effect.logInfo(
        `Initial test run succeeded. Ran ${tests.length} tests in ${Duration.format(gross)} (net ${
          totalTestTime(tests)
        } ms, overhead ${overheadMillis} ms).`,
      ).pipe(
        Effect.andThen(
          Effect.when(
            Effect.logInfo('Note: running the dry-run only. No mutations will be tested.'),
            Effect.succeed(prev.options.dryRunOnly),
          ),
        ),
      )
    ),
  )

const completeDryRunPassed = (raw: DryRunRaw): Effect.Effect<DryRunDone, StageError> =>
  Effect.gen(function*() {
    const prevDone = raw.prev
    const rawResult = raw.rawResult

    if (rawResult.status !== 'complete') {
      return yield* Effect.fail(
        new StageError({ stage: 'dryRun', reason: 'Unexpected dry-run status after decision' }),
      )
    }
    const tests = withOriginalFileNames(rawResult.tests, prevDone)
    const dryRunResult: CompleteDryRunResult = { ...rawResult, tests, status: 'complete' }
    const overheadMillis = overheadMillisOf(Duration.toMillis(raw.gross), tests)

    yield* offerReporterEvent(
      prevDone.reporterStage,
      {
        _tag: 'dryRunCompleted',
        timing: { net: totalTestTime(tests), overhead: overheadMillis },
        capabilities: { reloadEnvironment: raw.capabilities.reloadEnvironment },
        testCount: tests.length,
        tests: [...dryRunResult.tests],
      },
    ).pipe(Effect.ignoreCause)

    yield* announceDryRunOutcome(tests, prevDone, raw.gross, overheadMillis)

    return {
      ...prevDone,
      dryRunResult,
      testCoverage: testCoverageFrom(dryRunResult),
      timeOverhead: Duration.millis(overheadMillis),
    }
  })

export const dryRunCell = Cell.layer({
  read: (command: InstrumentDone) =>
    Effect.gen(function*() {
      yield* Scope.Scope
      const idGenerator = yield* IdGenerator

      const { files, testFiles } = buildDryRunFiles(command)
      const dryRunTimeout = command.options.dryRunTimeoutMinutes * 60 * 1000

      yield* Effect.logInfo('Starting dry run')
      const { rawResult, capabilities, gross } = yield* Effect.scoped(
        Effect.gen(function*() {
          const childRunnerEffect = makeChildProcessTestRunner({
            options: command.options,
            fileDescriptions: command.project.fileDescriptions,
            sandboxWorkingDirectory: command.sandbox.workingDirectory,
            idGenerator,
          })
          const runner = yield* buildTestRunner(
            {
              options: command.options,
              fileDescriptions: command.project.fileDescriptions,
              sandboxWorkingDirectory: command.sandbox.workingDirectory,
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
      }
      return raw
    }),
  decode: (raw: DryRunRaw): Result.Result<DryRunCommand, StageError> =>
    Match.value(raw.rawResult).pipe(
      Match.when(isCompleteDryRun, (complete) => decodeCompleteDryRun(complete, raw.prev.options.allowEmpty)),
      Match.when(isFailedDryRun, (failed) => decodeFailedDryRun(failed, raw.prev.options.allowEmpty)),
      Match.orElse((timedOut) => decodeTimedOutDryRun(timedOut, raw.prev.options.allowEmpty)),
    ),
  decide: dryRun,
  encode: (outcome) => outcome,
  write: (outcome, raw) =>
    withPhaseSpan(
      'dryRun',
      {},
      () =>
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
            Match.tag('DryRunPassed', () => completeDryRunPassed(raw)),
            Match.exhaustive,
          )
        }),
    ),
})

interface MutationTestRaw {
  readonly prev: DryRunDone
}

const passedCheck = (result: CheckResult): result is PassedCheckResult => result.status === 'passed'

const reportCheckOutcome = (
  [plan, result]: readonly [MutantRunPlan, CheckResult],
  reporting: MutationReportingService,
): Effect.Effect<void> =>
  Match.value(result).pipe(
    Match.when(passedCheck, () => Effect.void),
    Match.orElse((failed) => reporting.reportCheckFailure(toReportedMutant(plan.mutant), failed).pipe(Effect.asVoid)),
  )

const checkPlansWithOneChecker = (
  checkerPool: Pool.Pool<CheckerResourceService, unknown>,
  checkerName: string,
  plans: readonly MutantRunPlan[],
  reporting: MutationReportingService,
) =>
  Effect.gen(function*() {
    const checked = yield* Effect.scoped(
      Effect.flatMap(
        Pool.get(checkerPool),
        (checker) =>
          checkGroupedPlans(checker, checkerName, plans).pipe(
            Effect.catchTags({
              OutOfMemoryError: (error) =>
                Effect.flatMap(Pool.invalidate(checkerPool, checker), () => Effect.fail(error)),
              ChildProcessCrashedError: (error) =>
                Effect.flatMap(Pool.invalidate(checkerPool, checker), () => Effect.fail(error)),
            }),
          ),
      ),
    )
    yield* Effect.forEach(checked, (pair) => reportCheckOutcome(pair, reporting), {
      concurrency: 1,
      discard: true,
    })
    return checked.filter(([, result]) => result.status === 'passed').map(([plan]) => plan)
  })

const checkPlansWithEachChecker = (
  prev: DryRunDone,
  checkerPool: Pool.Pool<CheckerResourceService, unknown>,
  plans: readonly MutantRunPlan[],
  reporting: MutationReportingService,
) =>
  Effect.gen(function*() {
    let passed: readonly MutantRunPlan[] = plans
    for (const checkerName of prev.options.checkers) {
      passed = yield* checkPlansWithOneChecker(checkerPool, checkerName, passed, reporting)
    }
    return passed
  })

const checkPlansWithConfiguredCheckers = (
  prev: DryRunDone,
  checkerPool: Pool.Pool<CheckerResourceService, unknown> | undefined,
  plans: readonly MutantRunPlan[],
  reporting: MutationReportingService,
) =>
  Option.match(Option.fromNullishOr(checkerPool), {
    onNone: () => Effect.succeed(plans),
    onSome: (pool) => checkPlansWithEachChecker(prev, pool, plans, reporting),
  })

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
  decide: admitMutationTest,
  encode: (outcome) => outcome,
  write: (
    outcome: Result.Result<MutationTestDecision, MutationTestError>,
    raw: MutationTestRaw,
  ): Effect.Effect<RunOutcome, StageError, StageServices> =>
    withPhaseSpan(
      'mutationTest',
      { mutantCount: raw.prev.mutants.length, testCount: raw.prev.dryRunResult.tests.length },
      () =>
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
                      idGenerator: idGenerator,
                    }),
                  ),
                  size: prev.concurrency.testRunners,
                })
                const reporting = makeMutationReportingService({
                  reporterStage: prev.reporterStage,
                  options: prev.options,
                  project: prev.project,
                  testCoverage: prev.testCoverage,
                  runId: env.runId,
                  resolvedMode: env.resolvedMode,
                  pluginsByKind: prev.loadedPlugins.pluginsByKind,
                  sandboxDirectory: prev.sandbox.workingDirectory,
                  basePath: env.basePath,
                })
                const sandboxFileByName: Record<string, string> = Object.fromEntries(
                  [...MutableHashMap.keys(prev.project.filesToMutate)].map((name) => [
                    name,
                    prev.sandbox.sandboxFileFor(name),
                  ]),
                )
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
                yield* Effect.when(
                  Effect.logInfo(
                    `Incremental mode: reusing ${rememberedResults.length} mutant result(s), running ${incremental.mutants.length} mutant(s).`,
                  ),
                  Effect.succeed(rememberedResults.length > 0),
                )
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
                const sortedPlans = [...coveredPlans].sort(
                  (a, b) => Number(a.runOptions.reloadEnvironment) - Number(b.runOptions.reloadEnvironment),
                )
                const allPlansForReporter: readonly MutantRunPlan[] = [...sortedPlans]
                yield* offerReporterEvent(
                  prev.reporterStage,
                  {
                    _tag: 'mutationTestingPlanReady',
                    total: allPlansForReporter.length + noCoverageResults.length + rememberedResults.length,
                    plans: allPlansForReporter.map((plan) => ({
                      mutantId: plan.mutant.id,
                      plan: plan.plan,
                      netTime: plan.netTime,
                      reloadEnvironment: plan.runOptions.reloadEnvironment,
                    })),
                  },
                ).pipe(Effect.ignoreCause)
                {
                  const queue2 = yield* RunEvents
                  yield* Queue.offer(
                    queue2,
                    new PlanKnown({ total: allPlansForReporter.length + noCoverageResults.length }),
                  )
                }
                const passedPlans = yield* checkPlansWithConfiguredCheckers(prev, checkerPool, sortedPlans, reporting)
                const testRunnerStream = Stream.fromIterable(passedPlans)
                const plannedTotal = allPlansForReporter.length + noCoverageResults.length + rememberedResults.length
                const pathService = yield* Path.Path
                const progressQueue = yield* RunEvents
                const completedRef = yield* Ref.make(0)
                interface PreparedStreamableMutant {
                  readonly status: ValidMutantStatus
                  readonly file: string
                  readonly location: Location
                }
                const preparedStreamableOf = (
                  result: MutantResult,
                ): PreparedStreamableMutant | undefined => {
                  if (!isMutantStatus(result.status)) {
                    return undefined
                  }
                  return {
                    status: result.status,
                    file: reportFileName(pathService.relative(env.basePath, result.fileName)),
                    location: toSchemaLocation(result.location),
                  }
                }
                const toStreamEvent = (
                  result: MutantResult,
                  completed: number,
                  prepared: PreparedStreamableMutant,
                ): ReporterMutantTested => ({
                  _tag: 'mutantTested',
                  id: result.id,
                  status: prepared.status,
                  file: prepared.file,
                  location: prepared.location,
                  mutator: result.mutatorName,
                  replacement: result.replacement,
                  completed,
                  total: plannedTotal,
                })
                const offerFinished = (
                  result: MutantResult,
                  prepared: PreparedStreamableMutant | undefined,
                ): Effect.Effect<number | undefined> =>
                  Effect.gen(function*() {
                    if (prepared === undefined) {
                      return undefined
                    }
                    const completed = yield* Ref.updateAndGet(completedRef, (n) => n + 1)
                    yield* Queue.offer(
                      progressQueue,
                      new MutantTested({
                        id: result.id,
                        status: prepared.status,
                        file: prepared.file,
                        location: prepared.location,
                        mutator: result.mutatorName,
                        replacement: result.replacement,
                        completed,
                        total: plannedTotal,
                      }),
                    )
                    return completed
                  })
                const reportStreamTested = (
                  result: MutantResult,
                  completed: number,
                  prepared: PreparedStreamableMutant,
                ): Effect.Effect<void> =>
                  Effect.gen(function*() {
                    yield* offerReporterEvent(prev.reporterStage, toStreamEvent(result, completed, prepared)).pipe(
                      Effect.catchCause((cause) =>
                        Effect.logWarning('Reporter stream failed handling mutantTested', cause)
                      ),
                    )
                  })

                const offerStreamTested = (
                  result: MutantResult,
                  completed: number | undefined,
                  prepared: PreparedStreamableMutant | undefined,
                ): Effect.Effect<void> =>
                  Option.match(
                    Option.all([Option.fromNullishOr(completed), Option.fromNullishOr(prepared)] as const),
                    {
                      onNone: () => Effect.void,
                      onSome: ([done, streamable]) => reportStreamTested(result, done, streamable),
                    },
                  )
                const announceSettledMutant = (result: MutantResult): Effect.Effect<void> =>
                  Effect.gen(function*() {
                    const prepared = preparedStreamableOf(result)
                    const completed = yield* offerFinished(result, prepared)
                    yield* offerStreamTested(result, completed, prepared)
                  })
                yield* Effect.forEach(
                  [...rememberedResults, ...noCoverageResults],
                  announceSettledMutant,
                  { concurrency: 1, discard: true },
                )
                const completedMutants = yield* Ref.make<MutantResult[]>([...rememberedResults, ...noCoverageResults])
                const checkpointGate = yield* Semaphore.make(1)
                yield* reporting.checkpoint(yield* Ref.get(completedMutants)).pipe(
                  Effect.catchCause((cause) => Effect.logWarning('Failed to persist the mutation checkpoint', cause)),
                )
                const persist = (result: MutantResult) =>
                  checkpointGate.withPermits(1)(
                    Effect.gen(function*() {
                      const next = yield* Ref.updateAndGet(completedMutants, (prev) => [...prev, result])
                      yield* reporting.checkpoint(next).pipe(
                        Effect.catchCause((cause) =>
                          Effect.logWarning('Failed to persist the mutation checkpoint', cause)
                        ),
                      )
                    }),
                  )
                const runResults: MutantResult[] = yield* withPhaseSpan(
                  'mutationTest.batch',
                  { total: plannedTotal, testRunners: prev.concurrency.testRunners },
                  () =>
                    Stream.mapEffect(
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
                            const reported = yield* reporting.reportMutantRunResult(
                              toReportedMutant(plan.mutant),
                              result,
                            )
                            const prepared = preparedStreamableOf(reported)
                            const finished = yield* offerFinished(reported, prepared)
                            yield* offerStreamTested(reported, finished, prepared)
                            yield* persist(reported)
                            return reported
                          }),
                        ),
                      { concurrency: Math.max(1, prev.concurrency.testRunners) },
                    ).pipe(Stream.runCollect, Effect.map((chunk) => [...chunk])),
                )
                const allResults: MutantResult[] = [...rememberedResults, ...noCoverageResults, ...runResults]
                const outcomeResult = yield* reporting.reportAll(allResults)
                const doneNow = yield* Clock.currentTimeMillis
                const elapsed = Duration.millis(doneNow - env.runStartedAt)
                yield* Effect.logInfo(`Done in ${Duration.format(elapsed)}.`)
                const finalOutcome: RunOutcome = outcomeResult
                return finalOutcome
              })),
            Match.exhaustive,
          )
        }),
    ).pipe(
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
