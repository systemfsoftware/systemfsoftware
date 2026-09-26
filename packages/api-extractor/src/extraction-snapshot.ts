import type { Schema } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import { minimatch } from 'minimatch'

import {
  decodeNodePackageJson,
  decodeNodePackageJsonRecord,
  type INodePackageJson,
  PackageIndex,
} from './analyzer/graph/package-index.js'
import { resolveTsdocMetadataPath, TSDOC_METADATA_FILENAME } from './analyzer/graph/package-metadata.js'
import { makeWorkingPackage, type WorkingPackage } from './analyzer/graph/working-package.js'
import { dirname, resolve } from './analyzer/path-helpers.js'
import {
  BaselineAbsent,
  type BaselineEvidence,
  BaselinePresent,
  BaselineUnreadable,
  type ExtractionDecision,
  FolderAbsent,
  type FolderEvidence,
  FolderPresent,
} from './choose-extraction.workflow.js'
import { ExtractorMessageId } from './collector/extractor-message-id.js'
import { MessageLog } from './collector/message-log.js'
import { PackageName } from './collector/package-name.js'
import type { CompilerState } from './compiler/typescript-program.js'
import { hasDeclarationFileExtension } from './config/declaration-file.js'
import type { ExtractorConfig } from './config/extractor-config.js'
import { LOOKUP_TOKEN, PROJECT_FOLDER_TOKEN } from './config/tokens.js'
import type { ExtractorError } from './errors/extractor-error.schema.js'
import type { InternalInvariantError } from './errors/internal-invariant.schema.js'
import type { RenderFailure } from './generators/index.js'
import { renderTsdocMetadata } from './generators/tsdoc-metadata.js'
import { extractorPackageName, extractorVersion } from './version.js'
import type { TsdocMetadataWrite } from './write-plan.schema.js'

const WRONG_INPUT_FILE_TYPE_TEXT =
  'Incorrect file type; API Extractor expects to analyze compiler outputs with the .d.ts file extension. ' +
  'Troubleshooting tips: https://api-extractor.com/link/dts-error'

export const workingPackageOf = dual<
  (compilerState: CompilerState) => (config: ExtractorConfig) => Option.Option<WorkingPackage>,
  (config: ExtractorConfig, compilerState: CompilerState) => Option.Option<WorkingPackage>
>(2, (config: ExtractorConfig, compilerState: CompilerState): Option.Option<WorkingPackage> =>
  Option.map(
    Option.all([
      Option.fromNullishOr(compilerState.program.getSourceFile(config.mainEntryPointFilePath)),
      Option.fromNullishOr(config.packageFolder),
      Option.fromNullishOr(config.packageJson),
    ]),
    ([entryPointSourceFile, packageFolder, packageJson]) =>
      makeWorkingPackage({ entryPointSourceFile, packageFolder, packageJson }),
  ))

export const workingPackageDefectMessageOf = dual<
  (compilerState: CompilerState) => (config: ExtractorConfig) => string,
  (config: ExtractorConfig, compilerState: CompilerState) => string
>(
  2,
  (config: ExtractorConfig, compilerState: CompilerState): string =>
    compilerState.program.getSourceFile(config.mainEntryPointFilePath) === undefined
      ? 'Unable to load file: ' + config.mainEntryPointFilePath
      : 'Unable to find a package.json file for the project being analyzed',
)

const keysOf = (table: INodePackageJson['dependencies']): ReadonlyArray<string> =>
  Option.match(Option.fromNullishOr(table), {
    onNone: () => [],
    onSome: (present) => Object.keys(present),
  })

const DEPENDENCY_KEYS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const

const dependencyNamesOf = (packageJson: INodePackageJson | undefined): ReadonlyArray<string> =>
  Option.match(Option.fromNullishOr(packageJson), {
    onNone: () => [],
    onSome: (record) => Arr.flatMap(DEPENDENCY_KEYS, (key) => keysOf(record[key])),
  })

export const bundledPackageNamesOf = (config: ExtractorConfig): ReadonlyArray<string> =>
  Arr.flatMap(
    config.bundledPackages,
    (packageNameOrPattern) =>
      Match.value(PackageName.isValidName(packageNameOrPattern)).pipe(
        Match.when(true, (): ReadonlyArray<string> => [packageNameOrPattern]),
        Match.when(false, (): ReadonlyArray<string> =>
          Arr.filter(
            dependencyNamesOf(config.packageJson),
            (dependencyName) => minimatch(dependencyName, packageNameOrPattern),
          )),
        Match.exhaustive,
      ),
  )

export const preWalkerLogOf = dual<
  (compilerState: CompilerState) => (log: MessageLog) => MessageLog,
  (log: MessageLog, compilerState: CompilerState) => MessageLog
>(2, (log: MessageLog, compilerState: CompilerState): MessageLog => {
  const program = compilerState.program
  const withCompilerDiagnostics = Arr.reduce(
    program.getSemanticDiagnostics(),
    log,
    (accumulated, diagnostic) => MessageLog.addCompilerDiagnostic(accumulated, diagnostic),
  )
  const withBlocks = Match.value(withCompilerDiagnostics.diagnostics).pipe(
    Match.when(true, () => {
      const withRootNames = Arr.reduce(
        Arr.fromIterable(program.getRootFileNames()),
        MessageLog.addDiagnosticHeader(withCompilerDiagnostics, 'Root filenames'),
        (accumulated, fileName) => MessageLog.addDiagnostic(accumulated, fileName),
      )
      const withRootFooter = MessageLog.addDiagnosticFooter(withRootNames)
      const withHeader = MessageLog.addDiagnosticHeader(withRootFooter, 'Files analyzed by compiler')
      const withAnalyzedFiles = Arr.reduce(
        Arr.fromIterable(program.getSourceFiles()),
        withHeader,
        (accumulated, sourceFile) => MessageLog.addDiagnostic(accumulated, sourceFile.fileName),
      )
      return MessageLog.addDiagnosticFooter(withAnalyzedFiles)
    }),
    Match.when(false, () => withCompilerDiagnostics),
    Match.exhaustive,
  )
  return Match.value(
    Arr.findFirst(program.getSourceFiles(), (sourceFile) => !hasDeclarationFileExtension(sourceFile.fileName)),
  ).pipe(
    Match.when(Option.isSome, (found) =>
      MessageLog.addAnalyzerIssueForPosition(
        withBlocks,
        ExtractorMessageId.WrongInputFileType,
        WRONG_INPUT_FILE_TYPE_TEXT,
        found.value,
        0,
      )),
    Match.when(Option.isNone, () => withBlocks),
    Match.exhaustive,
  )
})

export const messagePathsOf = (log: MessageLog): ReadonlyArray<string> =>
  Arr.filterMap(MessageLog.candidates(log), (candidate) =>
    Match.value(candidate.message.category).pipe(
      Match.when('Compiler', () => Result.failVoid),
      Match.orElse(() => Result.fromOption(Option.fromNullishOr(candidate.message.sourceFilePath), () => undefined)),
    ))

export const baselineEvidenceOf = (read: Result.Result<Option.Option<string>, string>): BaselineEvidence =>
  Result.match(read, {
    onFailure: (text) => new BaselineUnreadable({ text }),
    onSuccess: (content) =>
      Option.match(content, {
        onNone: () => new BaselineAbsent(),
        onSome: (text) => new BaselinePresent({ content: text }),
      }),
  })

export const folderEvidenceOf = (exists: boolean): FolderEvidence =>
  Match.value(exists).pipe(
    Match.when(true, () => new FolderPresent()),
    Match.when(false, () => new FolderAbsent()),
    Match.exhaustive,
  )

export const renderFailureErrorOf = (failure: RenderFailure): ExtractorError | InternalInvariantError => failure

export const succeededOf = (decision: ExtractionDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('ExtractionPassed', () => true),
    Match.tag('ExtractionFailed', () => false),
    Match.exhaustive,
  )

export const decodedPackageJsonOf = (record: Readonly<Record<string, Schema.Json>>): Option.Option<INodePackageJson> =>
  Option.some(decodeNodePackageJsonRecord(record))

export const decodedPackageJsonTextOf = (content: string): Option.Option<INodePackageJson> =>
  Result.match(decodeNodePackageJson(content), {
    onSuccess: Option.some,
    onFailure: () => Option.none(),
  })

const explicitTsdocMetadataPathOf = (config: ExtractorConfig): Option.Option<string> =>
  Option.map(
    Option.filter(
      Option.fromNullishOr(config.tsdocMetadata.tsdocMetadataFilePath),
      (raw) => !raw.includes(LOOKUP_TOKEN),
    ),
    (raw) =>
      Match.value(raw.startsWith(PROJECT_FOLDER_TOKEN)).pipe(
        Match.when(true, () => resolve(config.projectFolder, raw.slice(PROJECT_FOLDER_TOKEN.length))),
        Match.when(false, () => raw),
        Match.exhaustive,
      ),
  )

export const tsdocMetadataTargetOf = (config: ExtractorConfig): Option.Option<TsdocMetadataWrite> =>
  Match.value(config.tsdocMetadata.enabled === true).pipe(
    Match.when(false, () => Option.none<TsdocMetadataWrite>()),
    Match.when(true, () =>
      Option.map(
        Option.all([Option.fromNullishOr(config.packageFolder), Option.fromNullishOr(config.packageJson)]),
        ([packageFolder, packageJsonRecord]): TsdocMetadataWrite => {
          const filePath = Option.getOrElse(
            Option.map(decodedPackageJsonOf(packageJsonRecord), (packageJson) =>
              resolveTsdocMetadataPath(
                packageFolder,
                packageJson,
                Option.getOrUndefined(explicitTsdocMetadataPathOf(config)),
              )),
            () => resolve(packageFolder, TSDOC_METADATA_FILENAME),
          )
          return {
            filePath,
            directoryPath: dirname(filePath),
            content: renderTsdocMetadata({
              packageName: extractorPackageName,
              packageVersion: extractorVersion,
            }),
          }
        },
      )),
    Match.exhaustive,
  )

export interface PackageEntry {
  readonly folder: string
  readonly packageJsonPath: Option.Option<string>
  readonly packageJson: Option.Option<INodePackageJson>
  readonly tsdocMetadataPath: Option.Option<string>
}

const workingPackageJsonOf = (
  entriesByFolder: HashMap.HashMap<string, PackageEntry>,
  folder: string,
): Option.Option<{ readonly packageJsonPath: string; readonly packageJson: INodePackageJson }> =>
  Option.flatMap(
    HashMap.get(entriesByFolder, folder),
    (entry) =>
      Option.flatMap(entry.packageJsonPath, (packageJsonPath) =>
        Option.map(entry.packageJson, (packageJson) => ({ packageJsonPath, packageJson }))),
  )

const tsdocMetadataIndexOf = (entries: ReadonlyArray<PackageEntry>, index: PackageIndex): PackageIndex =>
  Arr.reduce(
    entries,
    index,
    (accumulated, entry) =>
      Option.getOrElse(
        Option.map(entry.tsdocMetadataPath, (path) => PackageIndex.withTsdocMetadataPath(accumulated, path)),
        () => accumulated,
      ),
  )

export const packageIndexOf = dual<
  (sourceFileNames: ReadonlyArray<string>) => (entries: ReadonlyArray<PackageEntry>) => PackageIndex,
  (entries: ReadonlyArray<PackageEntry>, sourceFileNames: ReadonlyArray<string>) => PackageIndex
>(2, (entries: ReadonlyArray<PackageEntry>, sourceFileNames: ReadonlyArray<string>): PackageIndex => {
  const entriesByFolder = HashMap.fromIterable(Arr.map(entries, (entry) => [entry.folder, entry] as const))
  return Arr.reduce(
    sourceFileNames,
    tsdocMetadataIndexOf(entries, PackageIndex.empty()),
    (index, fileName) =>
      PackageIndex.withSourceFile(index, fileName, workingPackageJsonOf(entriesByFolder, dirname(fileName))),
  )
})
