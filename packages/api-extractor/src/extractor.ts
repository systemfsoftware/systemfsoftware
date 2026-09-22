/**
 * The `Extractor` facade: one config file in, one `ExtractorResult` out.
 *
 * Ports upstream `apps/api-extractor/src/api/Extractor.ts` onto Effect. The
 * program `runEffect` leaves its requirements open over
 * `FileSystem | Path | Terminal`; the shells (`src/invoke.ts`, `src/cli.ts`)
 * are the only places that bind Node layers (KTD6: ports in pure modules,
 * adapters at the shell).
 *
 * Outcome is a *result*, not a rejection: message-level findings (warnings, API
 * report drift, forgotten exports) are counted into `ExtractorResult` and never
 * raised into the typed channel. Only structural failures — an unreadable or
 * invalid config, an unusable tsconfig, a generator that cannot express the
 * input — reach `ExtractorError`.
 *
 * Every line the run prints (banner, configuration path, compiler preamble,
 * success footer) goes through the one `MessageRouter` whose verbosity came
 * from `resolveVerbosity` (KTD5), so `--quiet` and `"quiet": true` suppress
 * chatter at the gate instead of filtering formatted output afterwards.
 */
import * as Effect from 'effect/Effect'
import type * as FileSystem from 'effect/FileSystem'
import type * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import type * as Ts from 'typescript'

import { Collector } from './collector/Collector.js'
import { ConsoleMessageId, makeMessageRouter, MessageWriter } from './collector/message-router.js'
import type { MessageRouter } from './collector/message-router.js'
import type { LogLevel } from './collector/message-router.schema.js'
import { SourceMapper } from './collector/SourceMapper.js'
import type { CliFlags } from './collector/verbosity.schema.js'
import type { CompilerStateOptions } from './compiler/compiler-state.js'
import { loadCompilerState } from './compiler/compiler-state.js'
import type { ExtractorConfig } from './config/index.js'
import { loadExtractorConfig } from './config/index.js'
import { DocCommentEnhancer } from './enhancers/DocCommentEnhancer.js'
import { ValidationEnhancer } from './enhancers/ValidationEnhancer.js'
import type { ExtractorError } from './errors/index.js'
import { runGenerators } from './generators/index.js'

/**
 * The engine version, reported by `--version` and in the run banner.
 */
export const extractorVersion = '0.1.0'

/**
 * The outcome of one extraction run.
 */
export interface ExtractorResult {
  /**
   * Whether the run counts as a success: no errors, and — outside a local build
   * — no warnings either. A local build updates the API report instead of
   * failing on it, so warnings do not fail it.
   */
  readonly succeeded: boolean

  /** Errors reported during the run (message-level; exceptions are not counted). */
  readonly errorCount: number

  /** Warnings reported during the run. */
  readonly warningCount: number
}

/**
 * Runtime options for one run.
 */
export interface ExtractorRunOptions {
  /**
   * A local build (the CLI's `--local`): the API report is updated in place and
   * warnings do not fail the run.
   */
  readonly localBuild?: boolean

  /** Print the diff of a changed API report as a warning (the CLI's `--print-api-report-diff`). */
  readonly printApiReportDiff?: boolean

  /** A folder containing a `typescript` package, for the system typings. */
  readonly typescriptCompilerFolder?: string

  /** The CLI flags that feed the verbosity gate (KTD5). */
  readonly cliFlags?: CliFlags
}

/** What a run counts as it emits messages. */
interface MessageCounters {
  errorCount: number
  warningCount: number
}

/** The generator options `runGenerators` accepts (`GeneratorOptions` in U7's module). */
interface GeneratorRunOptions {
  readonly localBuild?: boolean
  readonly printApiReportDiff?: boolean
}

const EMPTY_COUNTERS: MessageCounters = { errorCount: 0, warningCount: 0 }

const bumpError = (counters: MessageCounters): void => {
  counters.errorCount += 1
}

const bumpWarning = (counters: MessageCounters): void => {
  counters.warningCount += 1
}

const ignoreLevel = (): void => undefined

/**
 * How each log level moves the counters. Errors and warnings are admitted by
 * every verbosity, so counting at the writer is counting the whole run.
 */
const counterFor: Record<LogLevel, (counters: MessageCounters) => void> = {
  error: bumpError,
  warning: bumpWarning,
  info: ignoreLevel,
  verbose: ignoreLevel,
  none: ignoreLevel,
}

const countLevel = (counters: MessageCounters, level: LogLevel): Effect.Effect<void> =>
  Effect.sync(() => counterFor[level](counters))

/**
 * The writer the run's router emits through: counts the message, then displays
 * it. Nothing is displayed unless the router admitted the message, so a silent
 * run writes nothing at all.
 */
const countingWriter = (
  counters: MessageCounters,
  writer: MessageWriter,
): MessageWriter => ({
  write: (level, text) => Effect.andThen(countLevel(counters, level), writer.write(level, text)),
})

const buildRouter = (
  config: ExtractorConfig,
  options: ExtractorRunOptions,
): Effect.Effect<MessageRouter, never, MessageWriter> =>
  makeMessageRouter({ cliFlags: options.cliFlags ?? {}, configQuiet: config.quiet }).pipe(
    Effect.map((router) => router),
  )

const bannerText = (): string => `api-extractor ${extractorVersion} - https://api-extractor.com/`

const configPathText = (configFilePath: string): string => `Using configuration from ${configFilePath}`

const preambleText = (compilerVersion: string): string =>
  `Analysis will use the bundled TypeScript version ${compilerVersion}`

const announce = (router: MessageRouter, messageId: ConsoleMessageId, text: string): Effect.Effect<void> =>
  Effect.orDie(router.logInfo(messageId, text))

const announceStart = (router: MessageRouter, config: ExtractorConfig): Effect.Effect<void> =>
  Effect.andThen(
    announce(router, ConsoleMessageId.Banner, bannerText()),
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

const optionalLocalBuild = (localBuild: boolean | undefined): { readonly localBuild?: boolean } =>
  localBuild === undefined ? {} : { localBuild }

const optionalPrintDiff = (
  printApiReportDiff: boolean | undefined,
): { readonly printApiReportDiff?: boolean } => printApiReportDiff === undefined ? {} : { printApiReportDiff }

const generatorOptionsOf = (options: ExtractorRunOptions): GeneratorRunOptions => ({
  ...optionalLocalBuild(options.localBuild),
  ...optionalPrintDiff(options.printApiReportDiff),
})

const succeededOf = (counters: MessageCounters, localBuild: boolean | undefined): boolean =>
  localBuild === true ? counters.errorCount === 0 : counters.errorCount + counters.warningCount === 0

const resultOf = (counters: MessageCounters, localBuild: boolean | undefined): ExtractorResult => ({
  succeeded: succeededOf(counters, localBuild),
  errorCount: counters.errorCount,
  warningCount: counters.warningCount,
})

/**
 * Build the symbol graph for the entry points: the collector's own analysis plus
 * the two enhancers that decorate it, in upstream's order.
 */
const collectSymbols = (
  config: ExtractorConfig,
  router: MessageRouter,
  program: Ts.Program,
): Collector => {
  const collector = new Collector({
    program,
    extractorConfig: config,
    messageRouter: router,
    sourceMapper: new SourceMapper(),
  })
  collector.analyze()
  DocCommentEnhancer.analyze(collector)
  ValidationEnhancer.analyze(collector)
  return collector
}

const compileAndGenerate = (
  config: ExtractorConfig,
  options: ExtractorRunOptions,
  router: MessageRouter,
  counters: MessageCounters,
): Effect.Effect<ExtractorResult, ExtractorError | PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const compilerState = yield* loadCompilerState(compilerOptionsOf(config, options))
    yield* announce(router, ConsoleMessageId.Preamble, preambleText(compilerState.compiler.version))
    const collector = yield* Effect.sync(() => collectSymbols(config, router, compilerState.program))
    yield* runGenerators(collector, config, router, generatorOptionsOf(options))
    return resultOf(counters, options.localBuild)
  })

/**
 * Run the extractor over `configFilePath`.
 *
 * The config is loaded here — a bad config is a typed `ExtractorError`, not a
 * rejection — and the whole pipeline runs in-process: config, compiler state,
 * symbol collection, generation.
 */
export const runEffect = (
  configFilePath: string,
  options: ExtractorRunOptions = {},
): Effect.Effect<
  ExtractorResult,
  ExtractorError | PlatformError,
  FileSystem.FileSystem | Path.Path | MessageWriter
> =>
  Effect.gen(function*() {
    const counters = { ...EMPTY_COUNTERS }
    const config = yield* loadExtractorConfig(configFilePath)
    const writer = yield* MessageWriter
    const router = yield* buildRouter(config, options).pipe(
      Effect.provideService(MessageWriter, countingWriter(counters, writer)),
    )
    yield* announceStart(router, config)
    const result = yield* compileAndGenerate(config, options, router, counters)
    if (result.succeeded) {
      yield* announceSuccess(router)
    }
    return result
  })
