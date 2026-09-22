import * as Effect from 'effect/Effect'
import type * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Schema from 'effect/Schema'
import { CliError, Command, Flag } from 'effect/unstable/cli'

import { ExtractionPassed } from '../choose-extraction.workflow.js'
import type { CliFlags } from '../collector/verbosity.schema.js'
import { findConfigFileUpwards } from '../config/lookup.js'
import type { ExtractorRunOptions } from '../extraction-request.js'
import { MessageWriter } from '../message-writer.service.js'
import { runEffect } from '../run-extractor.js'

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
    Flag.withDescription('Path to an alternate TypeScript compiler package to use'),
    Flag.optional,
  ),
}

const noConfigFoundError = (): CliError.UserError =>
  new CliError.UserError({
    cause: new Error('Unable to find an api-extractor.json file'),
    userMessage: 'Unable to find an api-extractor.json file from current directory upwards',
  })

const resolveConfigPath = (
  explicitPath: Option.Option<string>,
): Effect.Effect<string, CliError.UserError, FileSystem.FileSystem | Path.Path> =>
  Option.match(explicitPath, {
    onSome: Effect.succeed,
    onNone: () =>
      findConfigFileUpwards('.').pipe(
        Effect.flatMap((opt) =>
          Effect.mapError(
            Effect.fromOption(opt),
            noConfigFoundError,
          )
        ),
      ),
  })

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

const runActionHandler = (
  flags: ParsedRunFlags,
): Effect.Effect<
  void,
  CliError.UserError,
  FileSystem.FileSystem | Path.Path | MessageWriter
> =>
  Effect.gen(function*() {
    const configPath = yield* resolveConfigPath(flags.config)
    const options = toExtractorOptions(flags)
    const result = yield* runEffect(configPath, options).pipe(
      Effect.mapError(
        (err) =>
          new CliError.UserError({
            cause: err,
            userMessage: `Extraction failed: ${err.message}`,
          }),
      ),
    )

    return yield* Match.value(isPassed(result)).pipe(
      Match.when(true, () => Effect.void),
      Match.when(false, () => executionFailedError(result.errorCount)),
      Match.exhaustive,
    )
  })

export const runCommand = Command.make('run', runFlagsConfig, runActionHandler).pipe(
  Command.withDescription('Invoke API Extractor on a project'),
)
