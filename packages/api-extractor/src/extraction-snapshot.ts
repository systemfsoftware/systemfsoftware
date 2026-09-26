import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import { minimatch } from 'minimatch'

import { decodeNodePackageJson, type INodePackageJson, PackageIndex } from './analyzer/graph/package-index.js'
import { resolveTsdocMetadataPath } from './analyzer/graph/package-metadata.js'
import { makeWorkingPackage, type WorkingPackage } from './analyzer/graph/working-package.js'
import { dirname } from './analyzer/path-helpers.js'
import { type BaselineEvidence, type ExtractionDecision, type FolderEvidence } from './choose-extraction.workflow.js'
import { ExtractorMessageId } from './collector/extractor-message-id.js'
import { MessageLog } from './collector/message-log.js'
import { PackageName } from './collector/package-name.js'
import type { CompilerState } from './compiler/typescript-program.js'
import { absolutePathOf } from './config/absolute-path.js'
import { hasDeclarationFileExtension } from './config/declaration-file.js'
import { packageJsonOf } from './config/extractor-config.js'
import type { ExtractorConfig } from './config/extractor-config.js'
import type { PackageFound } from './config/extractor-config.schema.js'
import type { ExtractorError } from './errors/extractor-error.schema.js'
import type { InternalInvariantError } from './errors/internal-invariant.schema.js'
import type { RenderFailure } from './generators/index.js'
import { renderTsdocMetadata } from './generators/tsdoc-metadata.js'
import { extractorPackageName, extractorVersion } from './version.js'
import type { TsdocMetadataWrite } from './write-plan.schema.js'

const WRONG_INPUT_FILE_TYPE_TEXT =
  'Incorrect file type; API Extractor expects to analyze compiler outputs with the .d.ts file extension. ' +
  'Troubleshooting tips: https://api-extractor.com/link/dts-error'

/** The nearest `package.json` the configuration read, from the one place the read decoded it. */
const foundPackageOf = (config: ExtractorConfig): Option.Option<PackageFound> =>
  Match.value(config.packageLocation).pipe(
    Match.tag('PackageFound', (found) => Option.some(found)),
    Match.tag('NoPackage', () => Option.none<PackageFound>()),
    Match.exhaustive,
  )

export const workingPackageOf = dual<
  (compilerState: CompilerState) => (config: ExtractorConfig) => Option.Option<WorkingPackage>,
  (config: ExtractorConfig, compilerState: CompilerState) => Option.Option<WorkingPackage>
>(2, (config: ExtractorConfig, compilerState: CompilerState): Option.Option<WorkingPackage> =>
  Option.map(
    Option.all([
      Option.fromNullishOr(compilerState.program.getSourceFile(config.mainEntryPointFilePath)),
      foundPackageOf(config),
    ]),
    ([entryPointSourceFile, found]) =>
      makeWorkingPackage({
        entryPointSourceFile,
        packageFolder: found.folder,
        packageJson: found.packageJson,
      }),
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
          packageJsonOf(config).pipe(
            Option.getOrUndefined,
            dependencyNamesOf,
            (dependencyNames) =>
              Arr.filter(dependencyNames, (dependencyName) => minimatch(dependencyName, packageNameOrPattern)),
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
    onFailure: (text): BaselineEvidence => ({ _tag: 'BaselineUnreadable', text }),
    onSuccess: (content) =>
      Option.match(content, {
        onNone: (): BaselineEvidence => ({ _tag: 'BaselineAbsent' }),
        onSome: (text): BaselineEvidence => ({ _tag: 'BaselinePresent', content: text }),
      }),
  })

export const folderEvidenceOf = (exists: boolean): FolderEvidence =>
  Match.value(exists).pipe(
    Match.when(true, (): FolderEvidence => ({ _tag: 'FolderPresent' })),
    Match.when(false, (): FolderEvidence => ({ _tag: 'FolderAbsent' })),
    Match.exhaustive,
  )

export const renderFailureErrorOf = (failure: RenderFailure): ExtractorError | InternalInvariantError => failure

export const succeededOf = (decision: ExtractionDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('ExtractionPassed', () => true),
    Match.tag('ExtractionFailed', () => false),
    Match.exhaustive,
  )

export const decodedPackageJsonTextOf = (content: string): Option.Option<INodePackageJson> =>
  Result.match(decodeNodePackageJson(content), {
    onFailure: () => Option.none(),
    onSuccess: (packageJson) => Option.some(packageJson),
  })

const tsdocMetadataWriteOf = (
  config: ExtractorConfig,
  explicitPath: string | undefined,
): Result.Result<Option.Option<TsdocMetadataWrite>, InternalInvariantError> =>
  Option.match(foundPackageOf(config), {
    onNone: () => Result.succeed(Option.none<TsdocMetadataWrite>()),
    onSome: (found) =>
      Result.flatMap(
        absolutePathOf(resolveTsdocMetadataPath(found.folder, found.packageJson, explicitPath)),
        (filePath) =>
          Result.map(
            absolutePathOf(dirname(filePath)),
            (directoryPath): Option.Option<TsdocMetadataWrite> =>
              Option.some({
                filePath,
                directoryPath,
                content: renderTsdocMetadata({
                  packageName: extractorPackageName,
                  packageVersion: extractorVersion,
                }),
              }),
          ),
      ),
  })

export const tsdocMetadataTargetOf = (
  config: ExtractorConfig,
): Result.Result<Option.Option<TsdocMetadataWrite>, InternalInvariantError> =>
  Match.value(config.tsdocMetadata).pipe(
    Match.tag('TsdocMetadataSkipped', () => Result.succeed(Option.none<TsdocMetadataWrite>())),
    Match.tag('TsdocMetadataDefaultPath', () => tsdocMetadataWriteOf(config, undefined)),
    Match.tag('TsdocMetadataConfiguredPath', (configured) => tsdocMetadataWriteOf(config, configured.filePath)),
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
