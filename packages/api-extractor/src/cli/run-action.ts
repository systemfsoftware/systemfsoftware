import { Cell } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import type * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import type * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Schema from 'effect/Schema'
import { CliError, Command, Flag, type GlobalFlag } from 'effect/unstable/cli'

import { type ExtractionDecision, ExtractionPassed } from '../choose-extraction.workflow.js'
import type { CliFlags } from '../collector/verbosity.schema.js'
import type { TypeScriptCompiler } from '../compiler/typescript-compiler.service.js'
import { ConfigFileNotFound } from '../errors/config.schema.js'
import type { ExtractorError } from '../errors/extractor-error.schema.js'
import type { ExtractorRunInput, ExtractorRunOptions } from '../extraction-request.js'
import { locateConfig } from '../locate-config.cell.js'
import { LocateConfig } from '../locate-config.schema.js'
import { MessageWriter } from '../message-writer.service.js'
import { cell as extractorCell } from '../run-extractor.js'
import { DebugFlag, failureTextOf } from './debug-flag.js'

export interface ParsedRunFlags {
  readonly config: Option.Option<string>
  readonly local: boolean
  readonly quiet: boolean
  readonly verbose: boolean
  readonly diagnostics: boolean
  readonly printApiReportDiff: boolean
  readonly typescriptCompilerFolder: Option.Option<string>
}

export const runFlagsConfig = {
  config: Flag.String('config').pipe(
    Flag.withAlias('c'),
    Flag.withDescription('Path to the api-extractor.json file to invoke'),
    Flag.optional,
  ),
  local: Flag.Boolean('local').pipe(
    Flag.withAlias('l'),
    Flag.withDescription('Run in local build mode: update the API report in place'),
    Flag.withDefault(false),
  ),
  quiet: Flag.Boolean('quiet').pipe(
    Flag.withAlias('q'),
    Flag.withDescription('Suppress preamble, banner, and success output on exit 0'),
    Flag.withDefault(false),
  ),
  verbose: Flag.Boolean('verbose').pipe(
    Flag.withAlias('v'),
    Flag.withDescription('Show verbose information messages'),
    Flag.withDefault(false),
  ),
  diagnostics: Flag.Boolean('diagnostics').pipe(
    Flag.withDescription('Show diagnostic troubleshooting information; forces verbose'),
    Flag.withDefault(false),
  ),
  printApiReportDiff: Flag.Boolean('print-api-report-diff').pipe(
    Flag.withDescription('Print the diff of changed API reports'),
    Flag.withDefault(false),
  ),
  typescriptCompilerFolder: Flag.String('typescript-compiler-folder').pipe(
    Flag.withDescription(
      "Folder of an installed TypeScript package whose system typings (e.g. lib.dom.d.ts) replace the bundled compiler's; analysis still uses the bundled compiler",
    ),
    Flag.optional,
  ),
}

const noConfigFoundError = (): CliError.UserError =>
  new CliError.UserError({
    cause: new Error('Unable to find an api-extractor.json file'),
    userMessage: 'Unable to find an api-extractor.json file from current directory upwards',
  })

const refusalOf = (
  failure: ConfigFileNotFound | ExtractorError | PlatformError,
  debug: boolean,
): CliError.UserError =>
  Match.value(failure).pipe(
    Match.tag('ConfigFileNotFound', () => noConfigFoundError()),
    Match.orElse((cause) =>
      new CliError.UserError({
        cause,
        userMessage: debug ? failureTextOf(cause, true) : `Extraction failed: ${cause.message}`,
      })
    ),
  )

const outcomeMessageOf = (errorCount: number): string =>
  Match.value(errorCount > 0).pipe(
    Match.when(true, () => 'API Extractor completed with errors'),
    Match.when(false, () => 'API Extractor completed with warnings'),
    Match.exhaustive,
  )

const executionFailedError = (errorCount: number): CliError.UserError => {
  const message = outcomeMessageOf(errorCount)
  return new CliError.UserError({
    cause: new Error(message),
    userMessage: message,
  })
}

const optionalFolder = (
  opt: Option.Option<string>,
): { readonly typescriptCompilerFolder?: string } =>
  Option.match(opt, {
    onSome: (folder) => ({ typescriptCompilerFolder: folder }),
    onNone: () => ({}),
  })

const toExtractorOptions = (flags: ParsedRunFlags): ExtractorRunOptions => {
  const cliFlags: CliFlags = {
    quiet: flags.quiet,
    verbose: flags.verbose,
    diagnostics: flags.diagnostics,
  }
  return {
    localBuild: flags.local,
    printApiReportDiff: flags.printApiReportDiff,
    cliFlags,
    ...optionalFolder(flags.typescriptCompilerFolder),
  }
}

const isPassed = Schema.is(ExtractionPassed)

const outcomeEffect = (decision: ExtractionDecision): Effect.Effect<void, CliError.UserError> =>
  Match.value(isPassed(decision)).pipe(
    Match.when(true, () => Effect.void),
    Match.when(false, () => Effect.fail(executionFailedError(decision.errorCount))),
    Match.exhaustive,
  )

const runCell = Cell.flatMap(
  Cell.mapInput(locateConfig, (flags: ParsedRunFlags) =>
    new LocateConfig({
      explicitPath: Option.getOrUndefined(flags.config),
      startFolder: '.',
    })),
  (configFilePath: string) =>
    Cell.mapInput(extractorCell, (flags: ParsedRunFlags): ExtractorRunInput => ({
      configFilePath,
      options: toExtractorOptions(flags),
    })),
)

/**
 * The `run` handler: locate the config, compose the extractor cell, and turn its decision into
 * the command's outcome. Under `--debug` a typed failure reports its full cause; otherwise only
 * its message reaches the console.
 */
const runActionHandler = (
  flags: ParsedRunFlags,
): Effect.Effect<
  void,
  CliError.UserError,
  FileSystem.FileSystem | Path.Path | MessageWriter | TypeScriptCompiler | GlobalFlag.Setting.Identifier<'debug'>
> =>
  Effect.flatMap(DebugFlag, (debug) =>
    runCell.pipe(
      Cell.mapError((failure) => refusalOf(failure, debug)),
      Cell.flatMap((decision) => Cell.fromEffect(outcomeEffect(decision))),
    ).run(flags))

export const runCommand = Command.make('run', runFlagsConfig, runActionHandler).pipe(
  Command.withDescription('Invoke API Extractor on a project'),
)
