import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Array, Effect, Option } from 'effect'
import type * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import type * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Result from 'effect/Result'
import type * as Ts from 'typescript'

import { Collector } from './collector/Collector.js'
import { ConsoleMessageId, makeMessageRouter } from './collector/message-router.js'
import type { MessageRouter, MessageWriter } from './collector/message-router.js'
import { SourceMapper } from './collector/SourceMapper.js'
import type { CliFlags } from './collector/verbosity.schema.js'
import type { CompilerState, CompilerStateOptions } from './compiler/compiler-state.resource.js'
import { loadCompilerState } from './compiler/compiler-state.resource.js'
import type { ApiReportVariant } from './config/config-file.schema.js'
import type { ExtractorConfig } from './config/index.js'
import { loadExtractorConfig } from './config/index.js'
import { DocCommentEnhancer } from './enhancers/DocCommentEnhancer.js'
import { ValidationEnhancer } from './enhancers/ValidationEnhancer.js'
import { ConfigSchemaValidationError, type ExtractorError, type UnsupportedSyntaxError } from './errors/index.js'
import { runGenerators } from './generators/index.js'
import { planExtractorRun, RunPlanCommand } from './plan-extractor-run.workflow.js'
import type { RunPlan, RunPlanDecision, RunRuntime } from './plan-extractor-run.workflow.js'

export interface ExtractorResult {
  readonly succeeded: boolean
  readonly errorCount: number
  readonly warningCount: number
}

export interface ExtractorRunOptions {
  readonly localBuild?: boolean
  readonly printApiReportDiff?: boolean
  readonly typescriptCompilerFolder?: string
  readonly cliFlags?: CliFlags
}

export interface ExtractorRunInput {
  readonly configFilePath: string
  readonly options: ExtractorRunOptions
  readonly extractorVersion: string
}

interface MessageRouterCounters {
  readonly errorCount: number
  readonly warningCount: number
}

const routerCountersOf = (router: MessageRouter): MessageRouterCounters => ({
  errorCount: router.errorCount(),
  warningCount: router.warningCount(),
})

const buildRouter = (
  config: ExtractorConfig,
  options: ExtractorRunOptions,
  sourceMapper: SourceMapper,
): Effect.Effect<MessageRouter, ConfigSchemaValidationError, MessageWriter> =>
  makeMessageRouter(
    { cliFlags: options.cliFlags ?? {}, configQuiet: config.quiet },
    {
      messagesConfig: config.messages,
      workingPackageFolder: config.projectFolder,
      sourceMapper,
    },
  ).pipe(
    Effect.mapError(
      (err) =>
        new ConfigSchemaValidationError({
          filePath: config.configFilePath,
          issues: [err.message],
          cause: err.cause,
        }),
    ),
  )

const bannerText = (version: string): string => `api-extractor ${version} - https://api-extractor.com/`

const configPathText = (configFilePath: string): string => `Using configuration from ${configFilePath}`

const preambleText = (compilerVersion: string): string =>
  `Analysis will use the bundled TypeScript version ${compilerVersion}`

const announce = (router: MessageRouter, messageId: ConsoleMessageId, text: string): Effect.Effect<void> =>
  Effect.orDie(router.logInfo(messageId, text))

const announceStart = (router: MessageRouter, config: ExtractorConfig, version: string): Effect.Effect<void> =>
  Effect.andThen(
    announce(router, ConsoleMessageId.Banner, bannerText(version)),
    announce(router, ConsoleMessageId.ConfigPath, configPathText(config.configFilePath)),
  )

const announceSuccess = (router: MessageRouter): Effect.Effect<void> =>
  announce(router, ConsoleMessageId.CompletedSuccessfully, 'API Extractor completed successfully')

const optionalCompilerFolder = (folder: string | undefined): { readonly typescriptCompilerFolder?: string } =>
  folder === undefined ? {} : { typescriptCompilerFolder: folder }

const compilerOptionsOf = (
  config: ExtractorConfig,
  options: ExtractorRunOptions,
): CompilerStateOptions => ({
  projectFolder: config.projectFolder,
  tsconfigFilePath: config.tsconfigFilePath,
  mainEntryPointFilePath: config.mainEntryPointFilePath,
  skipLibCheck: config.skipLibCheck,
  ...optionalCompilerFolder(options.typescriptCompilerFolder),
})

const succeededOf = (counters: MessageRouterCounters, localBuild: boolean): boolean =>
  Match.value(localBuild).pipe(
    Match.when(true, () => counters.errorCount === 0),
    Match.when(false, () => counters.errorCount + counters.warningCount === 0),
    Match.exhaustive,
  )

const resultOf = (counters: MessageRouterCounters, localBuild: boolean): ExtractorResult => ({
  succeeded: succeededOf(counters, localBuild),
  errorCount: counters.errorCount,
  warningCount: counters.warningCount,
})

const collectSymbols = (
  config: ExtractorConfig,
  router: MessageRouter,
  program: Ts.Program,
  sourceMapper: SourceMapper,
): Collector => {
  const collector = new Collector({
    program,
    extractorConfig: config,
    messageRouter: router,
    sourceMapper,
  })
  collector.analyze()
  DocCommentEnhancer.analyze(collector)
  ValidationEnhancer.analyze(collector)
  return collector
}

const isNonEmpty = (value: string | undefined): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(value), (p) => p.length > 0)

const configuredRollupTargets = (config: ExtractorConfig): readonly string[] =>
  Array.getSomes([
    isNonEmpty(config.dtsRollup.untrimmedFilePath),
    isNonEmpty(config.dtsRollup.alphaTrimmedFilePath),
    isNonEmpty(config.dtsRollup.betaTrimmedFilePath),
    isNonEmpty(config.dtsRollup.publicTrimmedFilePath),
  ])

const rollupTargetsOf = (config: ExtractorConfig): readonly string[] =>
  Match.value(config.dtsRollup.enabled).pipe(
    Match.when(true, () => configuredRollupTargets(config)),
    Match.when(false, () => []),
    Match.exhaustive,
  )

const reviewVariantsOf = (config: ExtractorConfig): readonly ApiReportVariant[] =>
  Match.value(config.apiReport.enabled).pipe(
    Match.when(true, () => config.apiReport.reportConfigs.map((rc) => rc.variant)),
    Match.when(false, () => []),
    Match.exhaustive,
  )

const planOf = (
  config: ExtractorConfig,
  router: MessageRouter,
  compilerState: CompilerState,
  options: ExtractorRunOptions,
): RunPlan => ({
  configFilePath: config.configFilePath,
  projectFolder: config.projectFolder,
  compilerVersion: compilerState.compiler.version,
  verbosity: router.verbosity,
  reportVariants: reviewVariantsOf(config),
  rollupTargets: rollupTargetsOf(config),
  printApiReportDiff: options.printApiReportDiff === true,
})

const readRun = (
  input: ExtractorRunInput,
): Effect.Effect<
  RunPlanCommand,
  ExtractorError,
  FileSystem.FileSystem | Path.Path | MessageWriter
> =>
  Effect.gen(function*() {
    const config = yield* loadExtractorConfig(input.configFilePath)
    const sourceMapper = new SourceMapper()
    const router = yield* buildRouter(config, input.options, sourceMapper)
    yield* announceStart(router, config, input.extractorVersion)
    const compilerState = yield* loadCompilerState(compilerOptionsOf(config, input.options))
    return new RunPlanCommand({
      plan: planOf(config, router, compilerState, input.options),
      localBuild: input.options.localBuild === true,
      runtime: { config, compilerState, router, sourceMapper },
    })
  })

const announceIfSucceeded = (router: MessageRouter, succeeded: boolean): Effect.Effect<void> =>
  Match.value(succeeded).pipe(
    Match.when(true, () => announceSuccess(router)),
    Match.when(false, () => Effect.void),
    Match.exhaustive,
  )

const runPlanned = (
  runtime: RunRuntime,
  plan: RunPlan,
  localBuild: boolean,
): Effect.Effect<
  ExtractorResult,
  UnsupportedSyntaxError | PlatformError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const { compilerState, config, router, sourceMapper } = runtime
    yield* announce(router, ConsoleMessageId.Preamble, preambleText(plan.compilerVersion))
    const collector = yield* Effect.sync(() => collectSymbols(config, router, compilerState.program, sourceMapper))
    yield* runGenerators(collector, config, router, {
      localBuild,
      printApiReportDiff: plan.printApiReportDiff,
    })
    yield* router.handleRemainingNonConsoleMessages
    const result = resultOf(routerCountersOf(router), localBuild)
    yield* announceIfSucceeded(router, result.succeeded)
    return result
  })

const writeRun = (
  outcome: Result.Result<RunPlanDecision, never>,
  command: RunPlanCommand,
) =>
  Match.value(Result.getOrThrow(outcome)).pipe(
    Match.tag('ReportUpdatedPlanned', (decision) => runPlanned(command.runtime, decision.plan, true)),
    Match.tag('ReportVerifiedPlanned', (decision) => runPlanned(command.runtime, decision.plan, false)),
    Match.exhaustive,
  )

export const runExtractor = Sandwich.named('api_extractor.run')(readRun)
  .decide(planExtractorRun)
  .write(writeRun)
