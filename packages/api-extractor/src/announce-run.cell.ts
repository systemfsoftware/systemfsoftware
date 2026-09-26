import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import type { PlatformError } from 'effect/PlatformError'
import { NodePackageJsonFromString, type PackageJson } from './analyzer/graph/package-json.schema.js'
import { admits, formatConsoleLine } from './collector/message-router.js'
import {
  AnnounceRun,
  resolveVerbosity,
  VerbosityDiagnostics,
  VerbosityNormal,
  VerbositySilent,
  VerbosityVerbose,
} from './collector/resolve-verbosity.workflow.js'
import type { CliFlags, Verbosity } from './collector/verbosity.schema.js'
import { type ChainStepInput, configChainCell } from './config-chain.cell.js'
import {
  decodeExtractorConfig,
  type PackageManifest,
  type RawConfigLink,
  type RawConfigRead,
} from './config/extractor-config.js'
import {
  ancestorsNearestFirst,
  filePresent,
  PACKAGE_FILE_NAME,
  presentPathOf,
  readOptionalText,
  TSCONFIG_FILE_NAME,
} from './config/folder-walk.js'
import { preparePresenceOf } from './config/prepare-presence.js'
import { bannerText, configPathText } from './console-text.js'
import type { ExtractorError } from './errors/extractor-error.schema.js'
import { InternalInvariantError } from './errors/internal-invariant.schema.js'
import type { ExtractionRequest, ExtractorRunInput } from './extraction-request.js'
import { MessageWriter } from './message-writer.service.js'
import { ConfigNarration, narrateConfigSource } from './narrate-config-source.workflow.js'
import { extractorVersion } from './version.js'
import type { ConsoleTextLine } from './write-plan.schema.js'

type AnnounceRead = (typeof AnnounceRun)['Type']

type VerbosityVerdict =
  | (typeof VerbosityDiagnostics)['Encoded']
  | (typeof VerbosityVerbose)['Encoded']
  | (typeof VerbositySilent)['Encoded']
  | (typeof VerbosityNormal)['Encoded']

const readPackageManifest = (
  folder: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<Option.Option<PackageJson>, PlatformError> =>
  Effect.map(
    readOptionalText(path.join(folder, PACKAGE_FILE_NAME), fs),
    (content) =>
      Option.flatMap(
        content,
        (text) =>
          Result.getOrElse(
            Result.map(Schema.decodeResult(NodePackageJsonFromString)(text), (manifest) => Option.some(manifest)),
            () => Option.none<PackageJson>(),
          ),
      ),
  )

const tsconfigEvidenceOf = (
  folder: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<ReadonlyArray<Option.Option<string>>> =>
  Effect.forEach(
    ancestorsNearestFirst(folder, path),
    (ancestor) =>
      Effect.map(
        filePresent(path.join(ancestor, TSCONFIG_FILE_NAME), fs),
        (found): Option.Option<string> => Option.map(presentPathOf(found), () => ancestor),
      ),
    { concurrency: 1 },
  )

const nearestTsconfigFolder = (
  folder: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<Option.Option<string>> =>
  Effect.map(tsconfigEvidenceOf(folder, fs, path), (evidence) => Option.firstSomeOf(evidence))

const packageEvidenceOf = (
  folder: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<ReadonlyArray<Option.Option<PackageManifest>>, PlatformError> =>
  Effect.forEach(
    ancestorsNearestFirst(folder, path),
    (ancestor) =>
      Effect.map(
        readPackageManifest(ancestor, fs, path),
        (manifest): Option.Option<PackageManifest> =>
          Option.map(manifest, (packageJson): PackageManifest => ({ folder: ancestor, packageJson })),
      ),
    { concurrency: 1 },
  )

const nearestPackageJson = (
  folder: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<Option.Option<PackageManifest>, PlatformError> =>
  Effect.map(packageEvidenceOf(folder, fs, path), (evidence) => Option.firstSomeOf(evidence))

interface ChainAnnounceInput {
  readonly input: ExtractorRunInput
  readonly links: ReadonlyArray<RawConfigLink>
}

/**
 * Resolves the configuration path and follows the whole `extends` chain as one composed cell,
 * carrying the run input alongside the links it read so the announcement's read phase never runs
 * another cell itself.
 */
const resolvedChainCell: Cell.Cell<
  ExtractorRunInput,
  ChainAnnounceInput,
  ExtractorError | PlatformError,
  FileSystem.FileSystem | Path.Path
> = Cell.flatMap(
  Cell.id<ExtractorRunInput>(),
  (input) =>
    Cell.flatMap(
      Cell.fromEffect(Effect.map(Path.Path, (path) => path.resolve)),
      (resolve) =>
        Cell.map(
          Cell.mapInput(
            configChainCell,
            (_input: ExtractorRunInput): ChainStepInput => ({ filePath: resolve(input.configFilePath), visited: [] }),
          ),
          (links): ChainAnnounceInput => ({ input, links }),
        ),
    ),
)

const cliFlagsOf = (options: ExtractorRunInput['options']): CliFlags =>
  Option.getOrElse(Option.fromNullishOr(options.cliFlags), (): CliFlags => ({}))

const readAnnouncement = (
  command: ChainAnnounceInput,
): Effect.Effect<AnnounceRead, ExtractorError | PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const configFilePath = path.resolve(command.input.configFilePath)
    const configFolder = path.dirname(configFilePath)
    const read: RawConfigRead = {
      path,
      configFilePath,
      configFolder,
      links: command.links,
      tsconfigFolder: yield* nearestTsconfigFolder(configFolder, fs, path),
      packageJson: yield* nearestPackageJson(configFolder, fs, path),
    }
    const config = yield* Effect.catchTag(
      Effect.fromResult(decodeExtractorConfig(read)),
      'InternalInvariantError',
      (defect) => Effect.die(defect),
    )
    yield* preparePresenceOf(config)
    return {
      _tag: 'AnnounceRun',
      cliFlags: cliFlagsOf(command.input.options),
      configQuiet: config.quiet,
      config,
      options: command.input.options,
    }
  })

const writeLines = (writer: MessageWriter, lines: ReadonlyArray<ConsoleTextLine>): Effect.Effect<void> =>
  Effect.forEach(lines, (line) => writer.write(line.level, formatConsoleLine(line.level, line.text)), {
    concurrency: 1,
    discard: true,
  })

const admitting = (verbosity: Verbosity, lines: ReadonlyArray<ConsoleTextLine>): ReadonlyArray<ConsoleTextLine> =>
  Arr.filter(lines, (line) => admits(verbosity, line.level))

const bannerLines: ReadonlyArray<ConsoleTextLine> = [{ level: 'info', text: bannerText(extractorVersion) }]

const announceWith = (
  verbosity: Verbosity,
): (verdict: VerbosityVerdict, command: AnnounceRead) => Effect.Effect<ExtractionRequest, never, MessageWriter> =>
(_verdict, command) =>
  Effect.gen(function*() {
    const writer = yield* MessageWriter
    yield* writeLines(writer, admitting(verbosity, bannerLines))
    return { config: command.config, options: command.options, verbosity }
  })

const verbosityCell: Cell.Cell<
  ChainAnnounceInput,
  ExtractionRequest,
  ExtractorError | PlatformError,
  FileSystem.FileSystem | Path.Path | MessageWriter
> = Sandwich.named('api_extractor.announce_run')(readAnnouncement)
  .decide(resolveVerbosity)
  .write({
    VerbosityDiagnostics: announceWith('diagnostics'),
    VerbosityVerbose: announceWith('verbose'),
    VerbositySilent: announceWith('silent'),
    VerbosityNormal: announceWith('normal'),
    CommandRejected: (rejected) =>
      Effect.die(new InternalInvariantError({ message: 'The announce command failed to decode', cause: rejected })),
  })

type ConfigNarrationRaw = ExtractionRequest & (typeof ConfigNarration)['Encoded']

const readConfigNarration = (request: ExtractionRequest): Effect.Effect<ConfigNarrationRaw> =>
  Effect.succeed({
    _tag: 'ConfigNarration',
    config: request.config,
    options: request.options,
    verbosity: request.verbosity,
    autoLocated: request.options.configAutoLocated === true,
  })

const requestOf = (command: ExtractionRequest): ExtractionRequest => ({
  config: command.config,
  options: command.options,
  verbosity: command.verbosity,
})

const configLocationLines = (
  command: ExtractionRequest,
  baseFolder: string,
  path: Path.Path,
): ReadonlyArray<ConsoleTextLine> => [
  { level: 'info', text: configPathText(command.config.configFilePath, baseFolder, path) },
]

const narrationCell: Cell.Cell<ExtractionRequest, ExtractionRequest, never, Path.Path | MessageWriter> = Sandwich.named(
  'api_extractor.narrate_config_source',
)(readConfigNarration)
  .decide(narrateConfigSource)
  .write({
    ConfigSourceNarrated: (_decision, command) =>
      Effect.gen(function*() {
        const writer = yield* MessageWriter
        const path = yield* Path.Path
        const baseFolder = yield* Effect.sync(() => process.cwd())
        yield* writeLines(writer, admitting(command.verbosity, configLocationLines(command, baseFolder, path)))
        return requestOf(command)
      }),
    ConfigSourceNotNarrated: (_decision, command) => Effect.succeed(requestOf(command)),
    CommandRejected: (rejected) =>
      Effect.die(
        new InternalInvariantError({
          message: 'The config narration command failed to decode',
          cause: rejected,
        }),
      ),
  })

export const announceRun: Cell.Cell<
  ExtractorRunInput,
  ExtractionRequest,
  ExtractorError | PlatformError,
  FileSystem.FileSystem | Path.Path | MessageWriter
> = Cell.andThen(Cell.andThen(resolvedChainCell, verbosityCell), narrationCell)
