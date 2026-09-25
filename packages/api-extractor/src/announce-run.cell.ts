import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'

import { admits, formatConsoleLine } from './collector/message-router.js'
import type { LogLevel } from './collector/message-router.schema.js'
import {
  AnnounceRun,
  resolveVerbosity,
  VerbosityDiagnostics,
  VerbosityNormal,
  VerbositySilent,
  VerbosityVerbose,
} from './collector/resolve-verbosity.workflow.js'
import type { CliFlags, Verbosity } from './collector/verbosity.schema.js'
import {
  type ConfigReadError,
  decodeExtractorConfig,
  decodeJsonRecord,
  type MutableJsonRecord,
  type RawConfigLink,
  type RawConfigRead,
  type RawPackageJson,
  splitExtends,
} from './config/extractor-config.js'
import { filePresent, PACKAGE_FILE_NAME, searchUpwards, TSCONFIG_FILE_NAME } from './config/folder-walk.js'
import {
  CircularConfigExtendsError,
  ConfigExtendsResolutionError,
  ConfigFileNotFound,
  ConfigJsonSyntaxError,
} from './errors/config.schema.js'
import type { ExtractorError } from './errors/extractor-error.schema.js'
import { InternalInvariantError } from './errors/internal-invariant.schema.js'
import type { ExtractionRequest, ExtractorRunInput } from './extraction-request.js'
import { MessageWriter } from './message-writer.service.js'
import { extractorVersion } from './version.js'

const relativeSpecifierPattern = /^\.\.?[\\/]/

const isRelativeSpecifier = (specifier: string): boolean => relativeSpecifierPattern.test(specifier)

const resolveFromNodeModules = (
  specifier: string,
  fromFolder: string,
): Effect.Effect<string, ConfigExtendsResolutionError> =>
  Effect.try({
    try: () => process.getBuiltinModule('module').createRequire(`${fromFolder}/`).resolve(specifier),
    catch: (cause) => new ConfigExtendsResolutionError({ specifier, cause }),
  })

const extendsTargetOf = (
  specifier: string,
  fromFolder: string,
  path: Path.Path,
): Effect.Effect<string, ConfigExtendsResolutionError> =>
  Option.getOrElse(
    Option.map(
      Option.filter(Option.some(fromFolder), () => isRelativeSpecifier(specifier)),
      (folder) => Effect.succeed(path.resolve(folder, specifier)),
    ),
    () => resolveFromNodeModules(specifier, fromFolder),
  )

const bannerText = (version: string): string => `api-extractor ${version} - https://api-extractor.com/`

const configPathText = (configFilePath: string): string => `Using configuration from ${configFilePath}`

const emitAdmitted = (
  writer: MessageWriter,
  verbosity: Verbosity,
  level: LogLevel,
  text: string,
): Effect.Effect<void> =>
  Option.some(text).pipe(
    Option.filter(() => admits(verbosity, level)),
    Option.map((line) => writer.write(level, formatConsoleLine(level, line))),
    Option.getOrElse(() => Effect.void),
  )

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
  path: Path.Path,
  filePath: string,
): Effect.Effect<MutableJsonRecord, ConfigFileNotFound | ConfigJsonSyntaxError> =>
  Effect.flatMap(filePresent(filePath, fs), (present) =>
    Option.getOrElse(
      Option.map(
        present,
        (): Effect.Effect<MutableJsonRecord, ConfigFileNotFound | ConfigJsonSyntaxError> =>
          readConfigContent(fs, filePath),
      ),
      () =>
        Effect.fail(
          new ConfigFileNotFound({ startFolder: path.dirname(filePath), candidateNames: [filePath] }),
        ),
    ))

const chainStepOf = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  filePath: string,
  visited: readonly string[],
): Effect.Effect<readonly RawConfigLink[], ConfigReadError> =>
  Effect.flatMap(readConfigRecord(fs, path, filePath), (record) => {
    const { extendsSpecifier, stripped } = splitExtends(record)
    return Option.getOrElse(
      Option.map(
        Option.fromNullishOr(extendsSpecifier),
        (specifier) =>
          Effect.flatMap(extendsTargetOf(specifier, path.dirname(filePath), path), (target) =>
            Effect.map(
              chainOf(fs, path, target, [...visited, filePath]),
              (bases): readonly RawConfigLink[] => [{ filePath, record: stripped }, ...bases],
            )),
      ),
      () => Effect.succeed<readonly RawConfigLink[]>([{ filePath, record: stripped }]),
    )
  })

const chainOf = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  filePath: string,
  visited: readonly string[],
): Effect.Effect<readonly RawConfigLink[], ConfigReadError> =>
  Option.some(filePath).pipe(
    Option.filter((candidate) => visited.includes(candidate)),
    Option.map((circular) => Effect.fail(new CircularConfigExtendsError({ chain: [...visited, circular] }))),
    Option.getOrElse(() => chainStepOf(fs, path, filePath, visited)),
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
    Effect.orElseSucceed(() => Option.none<MutableJsonRecord>()),
  )

const nearestPackageJson = (
  folder: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<Option.Option<RawPackageJson>> =>
  searchUpwards(folder, path, (searched) =>
    Effect.map(
      readPackageRecord(searched, fs, path),
      (record): Option.Option<RawPackageJson> =>
        Option.map(record, (found): RawPackageJson => ({ folder: searched, record: found })),
    ))

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

type AnnounceRead = (typeof AnnounceRun)['Encoded']

type VerbosityVerdict =
  | (typeof VerbosityDiagnostics)['Encoded']
  | (typeof VerbosityVerbose)['Encoded']
  | (typeof VerbositySilent)['Encoded']
  | (typeof VerbosityNormal)['Encoded']

const cliFlagsOf = (options: ExtractorRunInput['options']): CliFlags =>
  Option.getOrElse(Option.fromNullishOr(options.cliFlags), (): CliFlags => ({}))

const readAnnouncement = (
  input: ExtractorRunInput,
): Effect.Effect<AnnounceRead, ExtractorError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const read = yield* readChain(input)
    const config = yield* Effect.fromResult(decodeExtractorConfig(read))
    return {
      _tag: 'AnnounceRun',
      cliFlags: cliFlagsOf(input.options),
      configQuiet: config.quiet,
      config,
      options: input.options,
    }
  })

const announceWith = (
  verbosity: Verbosity,
): (verdict: VerbosityVerdict, command: AnnounceRead) => Effect.Effect<ExtractionRequest, never, MessageWriter> =>
(_verdict, command) =>
  Effect.gen(function*() {
    const writer = yield* MessageWriter
    yield* emitAdmitted(writer, verbosity, 'info', bannerText(extractorVersion))
    yield* emitAdmitted(writer, verbosity, 'info', configPathText(command.config.configFilePath))
    return { config: command.config, options: command.options, verbosity }
  })

export const announceRun: Cell.Cell<
  ExtractorRunInput,
  ExtractionRequest,
  ExtractorError,
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
