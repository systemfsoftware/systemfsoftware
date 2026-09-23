import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Result from 'effect/Result'

import { admits, formatConsoleLine } from './collector/message-router.js'
import type { LogLevel } from './collector/message-router.schema.js'
import { AnnounceRun, resolveVerbosity, type VerbosityDecision } from './collector/resolve-verbosity.workflow.js'
import type { Verbosity } from './collector/verbosity.schema.js'
import {
  type ConfigReadError,
  type ExtractorConfig,
  type MutableJsonRecord,
  type RawConfigLink,
  type RawConfigRead,
  type RawPackageJson,
  decodeExtractorConfig,
  decodeJsonRecord,
  splitExtends,
} from './config/extractor-config.js'
import { filePresent, searchUpwards } from './config/folder-walk.js'
import {
  CircularConfigExtendsError,
  ConfigFileNotFound,
  ConfigJsonSyntaxError,
} from './errors/config.schema.js'
import type { ExtractorError } from './errors/index.js'
import type { ExtractionRequest, ExtractorRunInput } from './extraction-request.js'
import { MessageWriter } from './message-writer.service.js'
import { extractorVersion } from './version.js'

const TSCONFIG_FILE_NAME = 'tsconfig.json'
const PACKAGE_FILE_NAME = 'package.json'

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

const readConfigContent = (
  fs: FileSystem.FileSystem,
  filePath: string,
): Effect.Effect<MutableJsonRecord, ConfigJsonSyntaxError> =>
  fs.readFileString(filePath).pipe(
    Effect.mapError((cause) => new ConfigJsonSyntaxError({ filePath, cause: cause.message })),
    Effect.flatMap((content) => Effect.fromResult(decodeJsonRecord(filePath, content))),
  )

const readConfigRecord = (
  fs: FileSystem.FileSystem,
  filePath: string,
): Effect.Effect<MutableJsonRecord, ConfigFileNotFound | ConfigJsonSyntaxError> =>
  filePresent(filePath, fs).pipe(
    Effect.flatMap((present) =>
      Match.value(present).pipe(
        Match.when(Option.isNone, () => Effect.fail(new ConfigFileNotFound({ filePath }))),
        Match.when(Option.isSome, () => readConfigContent(fs, filePath)),
        Match.exhaustive,
      )),
  )

const extendsTargetOf = (specifier: string, fromFolder: string, path: Path.Path): string =>
  Match.value(specifier.startsWith('./') || specifier.startsWith('../')).pipe(
    Match.when(true, () => path.resolve(fromFolder, specifier)),
    Match.when(false, () => path.resolve(specifier)),
    Match.exhaustive,
  )

const chainOf = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  filePath: string,
  visited: readonly string[],
): Effect.Effect<readonly RawConfigLink[], ConfigReadError> =>
  Match.value(visited.includes(filePath)).pipe(
    Match.when(true, () => Effect.fail(new CircularConfigExtendsError({ chain: [...visited, filePath] }))),
    Match.when(false, () =>
      Effect.flatMap(readConfigRecord(fs, filePath), (record) => {
        const { extendsSpecifier, stripped } = splitExtends(record)
        return Option.match(Option.fromNullishOr(extendsSpecifier), {
          onNone: () => Effect.succeed<readonly RawConfigLink[]>([{ filePath, record: stripped }]),
          onSome: (specifier) =>
            Effect.map(
              chainOf(fs, path, extendsTargetOf(specifier, path.dirname(filePath), path), [...visited, filePath]),
              (bases): readonly RawConfigLink[] => [{ filePath, record: stripped }, ...bases],
            ),
        })
      })),
    Match.exhaustive,
  )

const nearestTsconfigFolder = (
  folder: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<Option.Option<string>> =>
  searchUpwards(folder, path, (searched) =>
    Effect.map(
      filePresent(path.join(searched, TSCONFIG_FILE_NAME), fs),
      (found): Option.Option<string> => Option.map(found, () => searched),
    ))

const readPackageRecord = (
  folder: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<Option.Option<MutableJsonRecord>> =>
  fs.readFileString(path.join(folder, PACKAGE_FILE_NAME)).pipe(
    Effect.flatMap((content) => Effect.fromResult(decodeJsonRecord(path.join(folder, PACKAGE_FILE_NAME), content))),
    Effect.asSome,
    Effect.orElseSucceed(() => Option.none()),
  )

const nearestPackageJson = (
  folder: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<Option.Option<RawPackageJson>> =>
  searchUpwards(folder, path, (searched) =>
    Effect.map(readPackageRecord(searched, fs, path), (record): Option.Option<RawPackageJson> =>
      Option.map(record, (found): RawPackageJson => ({ folder: searched, record: found }))))

/**
 * What the announce read phase gathers from disk: the extends chain, the folder the project
 * would be located in, and the nearest package manifest.
 */
const readChain = (
  input: ExtractorRunInput,
): Effect.Effect<RawConfigRead, ConfigReadError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const configFilePath = path.resolve(input.configFilePath)
    const configFolder = path.dirname(configFilePath)
    return {
      path,
      configFilePath,
      configFolder,
      links: yield* chainOf(fs, path, configFilePath, []),
      tsconfigFolder: yield* nearestTsconfigFolder(configFolder, fs, path),
      packageJson: yield* nearestPackageJson(configFolder, fs, path),
    }
  })

/**
 * What the read phase hands on. The Sandwich gives `write` the read snapshot and the encode
 * output only, and both the verbosity command and the request the extraction cell consumes
 * carry the configuration — so the snapshot carries it, decoded here by the pure decoder in
 * `config/extractor-config.js` and nowhere else.
 */
interface AnnounceRead {
  readonly input: ExtractorRunInput
  readonly config: ExtractorConfig
}

const readAnnouncement = (
  input: ExtractorRunInput,
): Effect.Effect<AnnounceRead, ExtractorError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const read = yield* readChain(input)
    const config = yield* Effect.fromResult(decodeExtractorConfig(read))
    return { input, config }
  })

const decodeAnnouncement = Sandwich.pure(
  (read: AnnounceRead): Result.Result<AnnounceRun, ExtractorError> =>
    Result.succeed(new AnnounceRun({
      cliFlags: read.input.options.cliFlags ?? {},
      configQuiet: read.config.quiet,
      config: read.config,
      options: read.input.options,
    })),
)

const writeAnnouncement = (
  outcome: Result.Result<VerbosityDecision, never>,
  read: AnnounceRead,
): Effect.Effect<ExtractionRequest, PlatformError, MessageWriter> =>
  Effect.gen(function*() {
    const writer = yield* MessageWriter
    const verbosity = verbosityOf(outcome)
    yield* emitAdmitted(writer, verbosity, 'info', bannerText(extractorVersion))
    yield* emitAdmitted(writer, verbosity, 'info', configPathText(read.config.configFilePath))
    return { config: read.config, options: read.input.options, verbosity }
  })

export const announceRun = Sandwich.named('api_extractor.announce_run')(readAnnouncement)
  .decode(decodeAnnouncement)
  .decide(resolveVerbosity)
  .encode(Sandwich.pure(Result.succeed))
  .write(writeAnnouncement)
