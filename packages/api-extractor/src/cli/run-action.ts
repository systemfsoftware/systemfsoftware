import { Cell } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import type * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Schema from 'effect/Schema'
import { Command, Flag, type GlobalFlag } from 'effect/unstable/cli'

import { type ExtractionDecision, ExtractionPassed } from '../choose-extraction.workflow.js'
import type { CliFlags } from '../collector/verbosity.schema.js'
import type { TypeScriptCompiler } from '../compiler/typescript-compiler.service.js'
import { completedWithErrorsText, completedWithWarningsText } from '../console-text.js'
import { ConfigFileNotFound } from '../errors/config.schema.js'
import type { ExtractorError } from '../errors/extractor-error.schema.js'
import type { ExtractorRunInput, ExtractorRunOptions } from '../extraction-request.js'
import { fileSystemFailureTextOf } from '../filesystem-error-text.js'
import { locateConfig } from '../locate-config.cell.js'
import { LocateConfig } from '../locate-config.schema.js'
import type { MessageWriter } from '../message-writer.service.js'
import { cell as extractorCell } from '../run-extractor.js'
import { DebugFlag } from './debug-flag.js'
import { failReported, refusalReport, reportedFailure, reportedTextOf } from './narration.js'
import { CliReportedError } from './reported-failure.schema.js'

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

const configPhaseFailureTags: Record<string, true> = {
  ConfigFileNotFound: true,
  ConfigJsonSyntaxError: true,
  ConfigSchemaValidationError: true,
  UnresolvedTokenError: true,
  CircularConfigExtendsError: true,
  ConfigExtendsResolutionError: true,
  UnsupportedFeatureError: true,
  MainEntryPointNotDeclarationError: true,
  MainEntryPointNotFoundError: true,
  ProjectFolderLookupError: true,
  ProjectFolderNotFoundError: true,
  TsconfigFileNotFoundError: true,
}

const isConfigPhaseFailure = (failure: ExtractorError | PlatformError): boolean =>
  configPhaseFailureTags[failure._tag] === true

const extractorFailureOf = (
  flags: ParsedRunFlags,
  failure: ExtractorError | PlatformError,
  configFilePath: string,
  debug: boolean,
): CliReportedError => {
  const reportedText = reportedTextOf(parsePhaseMessageOf(flags, failure, configFilePath), debug)
  const refused = isConfigPhaseFailure(failure)
  return Match.value(refused).pipe(
    Match.when(true, () => refusalReport(reportedText)),
    Match.when(false, () => reportedFailure('error', reportedText)),
    Match.exhaustive,
  )
}

const configAbsenceMessageOf = (flags: ParsedRunFlags): string =>
  Option.match(flags.config, {
    onSome: (value) => `Config file not found: ${value}`,
    onNone: () => 'Unable to find an api-extractor.json file',
  })

const parsePhaseMessageOf = (
  flags: ParsedRunFlags,
  failure: ExtractorError | PlatformError,
  configFilePath: string,
): string =>
  Match.value(failure).pipe(
    Match.tag('ConfigFileNotFound', () => configAbsenceMessageOf(flags)),
    Match.tag(
      'MainEntryPointNotDeclarationError',
      (parseFailure) => `Error parsing ${configFilePath}:\n${parseFailure.message}`,
    ),
    Match.tag(
      'MainEntryPointNotFoundError',
      (parseFailure) => `Error parsing ${configFilePath}:\n${parseFailure.message}`,
    ),
    Match.tag(
      'ProjectFolderLookupError',
      (parseFailure) => `Error parsing ${configFilePath}:\n${parseFailure.message}`,
    ),
    Match.tag(
      'ProjectFolderNotFoundError',
      (parseFailure) => `Error parsing ${configFilePath}:\n${parseFailure.message}`,
    ),
    Match.tag(
      'TsconfigFileNotFoundError',
      (parseFailure) => `Error parsing ${configFilePath}:\n${parseFailure.message}`,
    ),
    Match.tag(
      'UnresolvedTokenError',
      (parseFailure) => `Error parsing ${configFilePath}:\n${parseFailure.message}`,
    ),
    Match.tag('PlatformError', (platformFailure) =>
      Option.getOrElse(fileSystemFailureTextOf(platformFailure), () => platformFailure.message)),
    Match.orElse((failure) =>
      failure.message
    ),
  )

const outcomeMessageOf = (errorCount: number): string =>
  Match.value(errorCount > 0).pipe(
    Match.when(true, () => completedWithErrorsText()),
    Match.when(false, () => completedWithWarningsText()),
    Match.exhaustive,
  )

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
    configAutoLocated: Option.isNone(flags.config),
    ...optionalFolder(flags.typescriptCompilerFolder),
  }
}

const isPassed = Schema.is(ExtractionPassed)

const outcomeEffect = (decision: ExtractionDecision): Effect.Effect<void, CliReportedError> =>
  Match.value(isPassed(decision)).pipe(
    Match.when(true, () => Effect.void),
    Match.when(false, () => Effect.fail(reportedFailure('info', outcomeMessageOf(decision.errorCount)))),
    Match.exhaustive,
  )

const locateFailureOf = (
  flags: ParsedRunFlags,
  failure: ConfigFileNotFound | PlatformError,
  debug: boolean,
): CliReportedError =>
  Match.value(failure).pipe(
    Match.tag(
      'ConfigFileNotFound',
      () => refusalReport(reportedTextOf(configAbsenceMessageOf(flags), debug)),
    ),
    Match.orElse((cause) => refusalReport(reportedTextOf(cause.message, debug))),
  )

const runCell = (
  flags: ParsedRunFlags,
  debug: boolean,
): Cell.Cell<
  ParsedRunFlags,
  void,
  CliReportedError,
  FileSystem.FileSystem | MessageWriter | Path.Path | TypeScriptCompiler
> =>
  Cell.flatMap(
    Cell.mapError(
      Cell.mapInput(locateConfig, (flags: ParsedRunFlags) =>
        new LocateConfig({
          explicitPath: Option.getOrUndefined(flags.config),
          startFolder: '.',
        })),
      (failure: ConfigFileNotFound | PlatformError) => locateFailureOf(flags, failure, debug),
    ),
    (located: string) =>
      Cell.flatMap(
        Cell.fromEffect(Effect.map(Path.Path, (path) => path.resolve(located))),
        (configFilePath: string) =>
          Cell.flatMap(
            Cell.mapError(
              Cell.mapInput(extractorCell, (flags: ParsedRunFlags): ExtractorRunInput => ({
                configFilePath,
                options: toExtractorOptions(flags),
              })),
              (failure: ExtractorError | PlatformError) => extractorFailureOf(flags, failure, configFilePath, debug),
            ),
            (decision: ExtractionDecision) => Cell.fromEffect(outcomeEffect(decision)),
          ),
      ),
  )

/**
 * The `run` handler: narrate the banner upstream prints at process start, then locate the config,
 * compose the extractor cell, and turn its decision into upstream's completion line plus exit 1.
 */
const runActionHandler = (
  flags: ParsedRunFlags,
): Effect.Effect<
  void,
  CliReportedError,
  FileSystem.FileSystem | Path.Path | MessageWriter | TypeScriptCompiler | GlobalFlag.Setting.Identifier<'debug'>
> =>
  Effect.flatMap(DebugFlag, (debug) =>
    runCell(flags, debug).run(flags).pipe(
      Effect.catchTag('CliReportedError', failReported),
    ))

export const runCommand = Command.make('run', runFlagsConfig, runActionHandler).pipe(
  Command.withDescription('Invoke API Extractor on a project'),
)
