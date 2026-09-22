import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import type * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import type * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Result from 'effect/Result'

import { admits, formatConsoleLine } from './collector/message-router.js'
import type { LogLevel } from './collector/message-router.schema.js'
import { AnnounceRun, resolveVerbosity, type VerbosityDecision } from './collector/resolve-verbosity.workflow.js'
import type { Verbosity } from './collector/verbosity.schema.js'
import { loadExtractorConfig } from './config/extractor-config.js'
import type { ExtractorError } from './errors/index.js'
import type { ExtractionRequest, ExtractorRunInput } from './extraction-request.js'
import { MessageWriter } from './message-writer.service.js'
import { extractorVersion } from './version.js'

const bannerText = (version: string): string => `api-extractor ${version} - https://api-extractor.com/`

const configPathText = (configFilePath: string): string => `Using configuration from ${configFilePath}`

const verbosityOf = (outcome: Result.Result<VerbosityDecision, never>): Verbosity =>
  Match.value(Result.merge(outcome)).pipe(
    Match.tag('VerbosityDiagnostics', (): Verbosity => 'diagnostics'),
    Match.tag('VerbosityVerbose', (): Verbosity => 'verbose'),
    Match.tag('VerbositySilent', (): Verbosity => 'silent'),
    Match.tag('VerbosityNormal', (): Verbosity => 'normal'),
    Match.exhaustive,
  )

const emitAdmitted = (
  writer: MessageWriter,
  verbosity: Verbosity,
  level: LogLevel,
  text: string,
): Effect.Effect<void, PlatformError> =>
  admits(verbosity, level) ? writer.write(level, formatConsoleLine(level, text)) : Effect.void

const readAnnouncement = (
  input: ExtractorRunInput,
): Effect.Effect<AnnounceRun, ExtractorError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const config = yield* loadExtractorConfig(input.configFilePath)
    return new AnnounceRun({
      cliFlags: input.options.cliFlags ?? {},
      configQuiet: config.quiet,
      config,
      options: input.options,
    })
  })

const writeAnnouncement = (
  outcome: Result.Result<VerbosityDecision, never>,
  command: AnnounceRun,
): Effect.Effect<ExtractionRequest, PlatformError, MessageWriter> =>
  Effect.gen(function*() {
    const writer = yield* MessageWriter
    const verbosity = verbosityOf(outcome)
    yield* emitAdmitted(writer, verbosity, 'info', bannerText(extractorVersion))
    yield* emitAdmitted(writer, verbosity, 'info', configPathText(command.config.configFilePath))
    return { config: command.config, options: command.options, verbosity }
  })

export const announceRun = Sandwich.named('api_extractor.announce_run')(readAnnouncement)
  .decide(resolveVerbosity)
  .write(writeAnnouncement)
