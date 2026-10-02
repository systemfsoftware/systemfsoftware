import { Match, Schema } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as Option from 'effect/Option'
import type * as Path from 'effect/Path'
import * as Result from 'effect/Result'

import type { PackageJson } from '../analyzer/graph/package-json.schema.js'
import {
  CircularConfigExtendsError,
  ConfigExtendsResolutionError,
  ConfigFileNotFound,
  ConfigJsonSyntaxError,
  ConfigSchemaValidationError,
  MainEntryPointNotDeclarationError,
  ProjectFolderLookupError,
  type UnresolvedTokenError,
  UnsupportedFeatureError,
} from '../errors/config.schema.js'
import { InternalInvariantError } from '../errors/internal-invariant.schema.js'
import { absolutePathOf } from './absolute-path.js'
import type {
  ApiReportConfig,
  ApiReportVariant,
  DocModelConfig,
  DtsRollupConfig,
  MessagesConfig,
  TsdocMetadataConfig,
} from './config-file.schema.js'
import { ConfigFile } from './config-file.schema.js'
import {
  ApiReportLayer,
  CompilerLayer,
  type ConfiguredPath,
  DocModelLayer,
  DtsRollupLayer,
  RootLayer,
  TsdocMetadataLayer,
} from './config-layer.schema.js'
import { isConfigRecord } from './config-record.js'
import { hasDeclarationFileExtension } from './declaration-file.js'
import { DEFAULT_CONFIG_RECORD, DEFAULT_TAGS_TO_REPORT } from './defaults.js'
import type {
  ApiReportSettings,
  CompilerOverride,
  DocModelSettings,
  DtsRollupSettings,
  ExtractorConfig,
  ExtractorReportConfig,
  PackageLocation,
  RollupTarget,
  TsdocMetadataSettings,
} from './extractor-config.schema.js'
import {
  ApiReportDisabled,
  ApiReportEnabled,
  CompilerOverrideAbsent,
  CompilerOverridePresent,
  DocModelDisabled,
  DocModelEnabled,
  DtsRollupDisabled,
  DtsRollupEnabled,
  NoPackage,
  PackageFound,
  RollupSkipped,
  RollupWritten,
  TsdocMetadataConfiguredPath,
  TsdocMetadataDefaultPath,
  TsdocMetadataSkipped,
} from './extractor-config.schema.js'
import { JsonRecordFromString } from './json-record.schema.js'
import { MergeConfig, mergeConfig } from './merge-config.workflow.js'
import { violationOf } from './schema-issues.js'
import type { JoinSegments, TokenContext } from './tokens.js'
import {
  expandTokens,
  LOOKUP_TOKEN,
  PROJECT_FOLDER_TOKEN,
  rejectAnyTokens,
  UNKNOWN_PACKAGE_NAME,
  unscopedPackageName,
} from './tokens.js'

export type { ExtractorConfig, ExtractorReportConfig }

export type MutableJsonRecord = Record<string, Schema.Json>

/** Every failure the read phase can refuse a configuration chain with. */
export type ConfigReadError =
  | ConfigFileNotFound
  | ConfigJsonSyntaxError
  | CircularConfigExtendsError
  | ConfigExtendsResolutionError

/** Every failure the pure decode can refuse a configuration with. */
export type ConfigDecodeError =
  | ConfigSchemaValidationError
  | UnresolvedTokenError
  | UnsupportedFeatureError
  | MainEntryPointNotDeclarationError
  | ProjectFolderLookupError
  | InternalInvariantError

/** One configuration file the read phase read, and the record it holds (without its `extends`). */
export interface RawConfigLink {
  readonly filePath: string
  readonly record: MutableJsonRecord
}

/** The nearest `package.json` the read phase found, and the manifest it decoded to. */
export interface PackageManifest {
  readonly folder: string
  readonly packageJson: PackageJson
}

/**
 * Everything the read phase gathered from disk for one configuration: the extends chain it
 * walked, the folder the project would be located in, and the nearest package manifest. The
 * pure decode below turns this into the configuration the run uses; no I/O happens after it.
 */
export interface RawConfigRead {
  readonly path: Path.Path
  readonly configFilePath: string
  readonly configFolder: string
  readonly links: readonly RawConfigLink[]
  readonly tsconfigFolder: Option.Option<string>
  readonly packageJson: Option.Option<PackageManifest>
}

const emptyRecord: MutableJsonRecord = {}

/** Decodes one configuration file's text into the record the chain merges. */
export const decodeJsonRecord = dual<
  (content: string) => (filePath: string) => Result.Result<MutableJsonRecord, ConfigJsonSyntaxError>,
  (filePath: string, content: string) => Result.Result<MutableJsonRecord, ConfigJsonSyntaxError>
>(2, (
  filePath: string,
  content: string,
): Result.Result<MutableJsonRecord, ConfigJsonSyntaxError> =>
  Result.mapError(
    Schema.decodeResult(JsonRecordFromString)(content),
    (error) => new ConfigJsonSyntaxError({ filePath, cause: error.message }),
  ))

/** One merge fold through the merge workflow, projected to its record. */
export const mergeConfigObjects = dual<
  (derived: MutableJsonRecord) => (base: MutableJsonRecord) => MutableJsonRecord,
  (base: MutableJsonRecord, derived: MutableJsonRecord) => MutableJsonRecord
>(2, (
  base: MutableJsonRecord,
  derived: MutableJsonRecord,
): MutableJsonRecord => {
  const decision = Result.merge(mergeConfig(MergeConfig.make({ base, derived })))
  return Match.value(decision).pipe(
    Match.tag('ConfigMerged', (d) => ({ ...d.merged })),
    Match.tag('ConfigReplaced', (d) => ({ ...d.derived })),
    Match.exhaustive,
  )
})

const anchorIfRelative = (val: string, folder: string, path: Path.Path): string =>
  Match.value({ absolute: path.isAbsolute(val), token: val.startsWith(PROJECT_FOLDER_TOKEN) }).pipe(
    Match.when({ absolute: true }, () => val),
    Match.when({ token: true }, () => val),
    Match.orElse(() => path.join(folder, val)),
  )

/** The record with `key` set to `val`; an absent value leaves the record as it was. */
const assignIfPresent = (
  record: MutableJsonRecord,
  key: string,
  val: Schema.Json | undefined,
): MutableJsonRecord =>
  Option.match(Option.fromUndefinedOr(val), {
    onNone: () => record,
    onSome: (present) => ({ ...record, [key]: present }),
  })

const valueAt = (record: MutableJsonRecord, key: string): Schema.Json | undefined => record[key]

/** The value a decoded path setting anchors to: its text anchored, or the non-text value verbatim. */
const anchoredPathValueOf = (
  field: ConfiguredPath | undefined,
  folder: string,
  path: Path.Path,
): Schema.Json | undefined =>
  Option.match(Option.fromNullishOr(field), {
    onNone: () => undefined,
    onSome: (configured) =>
      Match.value(configured).pipe(
        Match.tag('PathText', (textual) => anchorIfRelative(textual.text, folder, path)),
        Match.tag('PathOther', (other) => other.value),
        Match.exhaustive,
      ),
  })

/**
 * Anchors the decoded path settings of one section back onto the record, leaving every other key
 * — including the keys upstream's schema will refuse — exactly where the file put it.
 */
const withAnchoredPaths = (
  section: Schema.Json | undefined,
  fields: ReadonlyArray<readonly [string, ConfiguredPath | undefined]>,
  folder: string,
  path: Path.Path,
): Schema.Json | undefined =>
  Option.match(Option.filter(Option.fromNullishOr(section), isConfigRecord), {
    onNone: () => section,
    onSome: (record) =>
      Arr.reduce(fields, record, (accumulated, [key, field]) =>
        assignIfPresent(accumulated, key, anchoredPathValueOf(field, folder, path))),
  })

const anchorCompiler = (
  compiler: Schema.Json | undefined,
  folder: string,
  path: Path.Path,
): Schema.Json | undefined =>
  Option.match(Schema.decodeUnknownOption(CompilerLayer)(compiler), {
    onNone: () => compiler,
    onSome: (layer) => withAnchoredPaths(compiler, [['tsconfigFilePath', layer.tsconfigFilePath]], folder, path),
  })

const anchorApiReport = (
  apiReport: Schema.Json | undefined,
  folder: string,
  path: Path.Path,
): Schema.Json | undefined =>
  Option.match(Schema.decodeUnknownOption(ApiReportLayer)(apiReport), {
    onNone: () => apiReport,
    onSome: (layer) =>
      withAnchoredPaths(
        apiReport,
        [['reportFolder', layer.reportFolder], ['reportTempFolder', layer.reportTempFolder]],
        folder,
        path,
      ),
  })

const anchorDocModel = (
  docModel: Schema.Json | undefined,
  folder: string,
  path: Path.Path,
): Schema.Json | undefined =>
  Option.match(Schema.decodeUnknownOption(DocModelLayer)(docModel), {
    onNone: () => docModel,
    onSome: (layer) => withAnchoredPaths(docModel, [['apiJsonFilePath', layer.apiJsonFilePath]], folder, path),
  })

const anchorDtsRollup = (
  dtsRollup: Schema.Json | undefined,
  folder: string,
  path: Path.Path,
): Schema.Json | undefined =>
  Option.match(Schema.decodeUnknownOption(DtsRollupLayer)(dtsRollup), {
    onNone: () => dtsRollup,
    onSome: (layer) =>
      withAnchoredPaths(
        dtsRollup,
        [
          ['untrimmedFilePath', layer.untrimmedFilePath],
          ['alphaTrimmedFilePath', layer.alphaTrimmedFilePath],
          ['betaTrimmedFilePath', layer.betaTrimmedFilePath],
          ['publicTrimmedFilePath', layer.publicTrimmedFilePath],
        ],
        folder,
        path,
      ),
  })

const anchorTsdocMetadata = (
  tsdocMetadata: Schema.Json | undefined,
  folder: string,
  path: Path.Path,
): Schema.Json | undefined =>
  Option.match(Schema.decodeUnknownOption(TsdocMetadataLayer)(tsdocMetadata), {
    onNone: () => tsdocMetadata,
    onSome: (layer) =>
      withAnchoredPaths(tsdocMetadata, [['tsdocMetadataFilePath', layer.tsdocMetadataFilePath]], folder, path),
  })

type AnchoredSection = readonly [
  key: string,
  anchor: (value: Schema.Json | undefined, folder: string, path: Path.Path) => Schema.Json | undefined,
]

const anchoredSections: readonly AnchoredSection[] = [
  ['compiler', anchorCompiler],
  ['apiReport', anchorApiReport],
  ['docModel', anchorDocModel],
  ['dtsRollup', anchorDtsRollup],
  ['tsdocMetadata', anchorTsdocMetadata],
]

/**
 * Every relative path a configuration file declares, anchored to the folder that file sits in:
 * a path another file's `extends` chain contributed is anchored to its own file, so the chain
 * merge below compares like with like. The settings are decoded first — text anchors, every other
 * value travels untouched.
 */
export const anchorRelativePaths = dual<
  (folder: string, path: Path.Path) => (config: MutableJsonRecord) => MutableJsonRecord,
  (config: MutableJsonRecord, folder: string, path: Path.Path) => MutableJsonRecord
>(3, (
  config: MutableJsonRecord,
  folder: string,
  path: Path.Path,
): MutableJsonRecord =>
  Option.match(Schema.decodeOption(RootLayer)(config), {
    onNone: () => config,
    onSome: (root) =>
      assignIfPresent(
        Arr.reduce(
          anchoredSections,
          config,
          (record, [key, anchor]) => assignIfPresent(record, key, anchor(valueAt(record, key), folder, path)),
        ),
        'projectFolder',
        anchoredPathValueOf(root.projectFolder, folder, path),
      ),
  }))

const packageNameOf = (packageJson: PackageJson | undefined): string =>
  Option.getOrElse(
    Option.flatMap(Option.fromNullishOr(packageJson), (manifest) => Option.fromNullishOr(manifest.name)),
    () => UNKNOWN_PACKAGE_NAME,
  )

const buildTokenContext = (
  projectFolder: string,
  packageJson: PackageJson | undefined,
): TokenContext => {
  const packageName = packageNameOf(packageJson)
  return {
    projectFolder,
    packageName,
    unscopedPackageName: unscopedPackageName(packageName),
  }
}

const variantSuffix = (variant: ApiReportVariant): string =>
  Match.value(variant).pipe(
    Match.when('complete', () => '.api.md'),
    Match.orElse((other) => `.${other}.api.md`),
  )

const defaultReportConfigs = (
  reportFileNameBase: string,
  variants: readonly ApiReportVariant[],
  tokenCtx: TokenContext,
  join: JoinSegments,
): Result.Result<readonly ExtractorReportConfig[], UnresolvedTokenError> =>
  Result.all(
    Arr.map(variants, (variant) =>
      Result.map(
        expandTokens(`${reportFileNameBase}${variantSuffix(variant)}`, tokenCtx, 'reportFileName', join),
        (fileName): ExtractorReportConfig => ({ variant, fileName }),
      )),
  )

const withoutReportSuffix = (rawFileName: string): string => rawFileName.replace(/\.api\.md$/, '')

const buildReportConfigs = (
  reportCfg: ApiReportConfig,
  tokenCtx: TokenContext,
  join: JoinSegments,
): Result.Result<readonly ExtractorReportConfig[], UnresolvedTokenError> =>
  defaultReportConfigs(
    Option.getOrElse(
      Option.map(Option.fromNullishOr(reportCfg.reportFileName), withoutReportSuffix),
      () => '<unscopedPackageName>',
    ),
    Option.getOrElse(Option.fromUndefinedOr(reportCfg.reportVariants), (): readonly ApiReportVariant[] => ['complete']),
    tokenCtx,
    join,
  )

const compilerOverrideOf = (overrideTsconfig: Schema.Json | undefined): CompilerOverride =>
  Option.match(Option.fromNullishOr(overrideTsconfig), {
    onNone: () => CompilerOverrideAbsent.make({}),
    onSome: (tsconfig) => CompilerOverridePresent.make({ tsconfig }),
  })

/** A resolved path: the configured value with `<projectFolder>` substituted, then resolved. */
const resolvedAtOf = (projectFolder: string, raw: string, path: Path.Path): string =>
  path.resolve(projectFolder, raw.replaceAll(PROJECT_FOLDER_TOKEN, projectFolder))

/** The leading `<projectFolder>` a `tsdocMetadataFilePath` may carry, resolved like upstream does. */
const substitutedProjectFolder = (projectFolder: string, raw: string, path: Path.Path): string =>
  Match.value(raw.startsWith(PROJECT_FOLDER_TOKEN)).pipe(
    Match.when(true, () => path.resolve(projectFolder, raw.slice(PROJECT_FOLDER_TOKEN.length))),
    Match.when(false, () => raw),
    Match.exhaustive,
  )

const defaultedPathOf = (raw: string | undefined, fallback: string): string =>
  Option.getOrElse(
    Option.filter(Option.fromNullishOr(raw), (present) => present.length > 0),
    () => fallback,
  )

const packageLocationOf = (
  manifest: Option.Option<PackageManifest>,
): Result.Result<PackageLocation, InternalInvariantError> =>
  Option.match(manifest, {
    onNone: () => Result.succeed(NoPackage.make({})),
    onSome: (found) =>
      Result.map(
        absolutePathOf(found.folder),
        (folder): PackageLocation => PackageFound.make({ folder, packageJson: found.packageJson }),
      ),
  })

const apiReportSettingsOf = (
  reportCfg: ApiReportConfig,
  reportConfigs: readonly ExtractorReportConfig[],
  projectFolder: string,
  path: Path.Path,
): Result.Result<ApiReportSettings, InternalInvariantError> =>
  Match.value(reportCfg.enabled).pipe(
    Match.when(false, () => Result.succeed(ApiReportDisabled.make({}))),
    Match.when(true, () =>
      Result.map(
        Result.all([
          absolutePathOf(resolvedAtOf(projectFolder, defaultedPathOf(reportCfg.reportFolder, 'etc'), path)),
          absolutePathOf(resolvedAtOf(projectFolder, defaultedPathOf(reportCfg.reportTempFolder, 'temp'), path)),
        ]),
        ([reportFolder, reportTempFolder]): ApiReportSettings =>
          ApiReportEnabled.make({
            reportFolder,
            reportTempFolder,
            includeForgottenExports: Option.getOrElse(
              Option.fromNullishOr(reportCfg.includeForgottenExports),
              () => false,
            ),
            tagsToReport: {
              ...DEFAULT_TAGS_TO_REPORT,
              ...Option.getOrElse(Option.fromNullishOr(reportCfg.tagsToReport), () => ({})),
            },
            reportConfigs,
          }),
      )),
    Match.exhaustive,
  )

const rollupTargetOf = (
  projectFolder: string,
  rawPath: string | undefined,
  path: Path.Path,
): Result.Result<RollupTarget, InternalInvariantError> =>
  Option.match(
    Option.filter(Option.fromNullishOr(rawPath), (written) => written.length > 0),
    {
      onNone: () => Result.succeed(RollupSkipped.make({})),
      onSome: (written) =>
        Result.map(
          absolutePathOf(resolvedAtOf(projectFolder, written, path)),
          (filePath): RollupTarget => RollupWritten.make({ filePath }),
        ),
    },
  )

const dtsRollupSettingsOf = (
  dtsRollup: DtsRollupConfig | undefined,
  projectFolder: string,
  path: Path.Path,
): Result.Result<DtsRollupSettings, InternalInvariantError> =>
  Option.match(Option.fromNullishOr(dtsRollup), {
    onNone: () => Result.succeed(DtsRollupDisabled.make({})),
    onSome: (rollup) =>
      Match.value(rollup.enabled).pipe(
        Match.when(false, () => Result.succeed(DtsRollupDisabled.make({}))),
        Match.when(true, () =>
          Result.map(
            Result.all([
              rollupTargetOf(projectFolder, rollup.untrimmedFilePath, path),
              rollupTargetOf(projectFolder, rollup.alphaTrimmedFilePath, path),
              rollupTargetOf(projectFolder, rollup.betaTrimmedFilePath, path),
              rollupTargetOf(projectFolder, rollup.publicTrimmedFilePath, path),
            ]),
            ([untrimmed, alpha, beta, publicTarget]): DtsRollupSettings =>
              DtsRollupEnabled.make({
                untrimmed,
                alpha,
                beta,
                public: publicTarget,
                omitTrimmingComments: Option.getOrElse(
                  Option.fromNullishOr(rollup.omitTrimmingComments),
                  () => false,
                ),
              }),
          )),
        Match.exhaustive,
      ),
  })

const docModelSettingsOf = (
  docModel: DocModelConfig | undefined,
  projectFolder: string,
  path: Path.Path,
): Result.Result<DocModelSettings, InternalInvariantError> =>
  Option.match(Option.fromNullishOr(docModel), {
    onNone: () => Result.succeed(DocModelDisabled.make({ includeForgottenExports: false })),
    onSome: (model) => {
      const includeForgottenExports = Option.getOrElse(
        Option.fromNullishOr(model.includeForgottenExports),
        () => false,
      )
      return Match.value(model.enabled).pipe(
        Match.when(true, () =>
          Result.map(
            absolutePathOf(
              resolvedAtOf(
                projectFolder,
                defaultedPathOf(model.apiJsonFilePath, '<projectFolder>/temp/<unscopedPackageName>.api.json'),
                path,
              ),
            ),
            (apiJsonFilePath): DocModelSettings => DocModelEnabled.make({ apiJsonFilePath, includeForgottenExports }),
          )),
        Match.when(false, () => Result.succeed(DocModelDisabled.make({ includeForgottenExports }))),
        Match.exhaustive,
      )
    },
  })

const tsdocMetadataSettingsOf = (
  tsdocMetadata: TsdocMetadataConfig | undefined,
  projectFolder: string,
  packageBaseFolder: string,
  path: Path.Path,
): Result.Result<TsdocMetadataSettings, InternalInvariantError> =>
  Option.match(Option.fromNullishOr(tsdocMetadata), {
    onNone: () => Result.succeed(TsdocMetadataSkipped.make({})),
    onSome: (metadata) =>
      Match.value(metadata.enabled === true).pipe(
        Match.when(false, () => Result.succeed(TsdocMetadataSkipped.make({}))),
        Match.when(true, () =>
          Option.match(
            Option.filter(
              Option.fromNullishOr(metadata.tsdocMetadataFilePath),
              (configured) => !configured.includes(LOOKUP_TOKEN),
            ),
            {
              onNone: () => Result.succeed(TsdocMetadataDefaultPath.make({})),
              onSome: (configured) =>
                Result.map(
                  absolutePathOf(
                    path.resolve(packageBaseFolder, substitutedProjectFolder(projectFolder, configured, path)),
                  ),
                  (filePath): TsdocMetadataSettings => TsdocMetadataConfiguredPath.make({ filePath }),
                ),
            },
          )),
        Match.exhaustive,
      ),
  })

const projectFolderOf = (
  read: RawConfigRead,
  validated: ConfigFile,
): Result.Result<string, ProjectFolderLookupError | UnresolvedTokenError> =>
  Option.match(Option.fromNullishOr(validated.projectFolder), {
    onNone: () => projectFolderFromLookup(read),
    onSome: (rawProjectFolder) => projectFolderFromRaw(read, rawProjectFolder),
  })

const projectFolderFromLookup = (read: RawConfigRead): Result.Result<string, ProjectFolderLookupError> =>
  Option.match(read.tsconfigFolder, {
    onNone: (): Result.Result<string, ProjectFolderLookupError> => Result.fail(new ProjectFolderLookupError({})),
    onSome: (folder) => Result.succeed(folder),
  })

const projectFolderFromRaw = (
  read: RawConfigRead,
  rawProjectFolder: string,
): Result.Result<string, ProjectFolderLookupError | UnresolvedTokenError> =>
  Match.value(rawProjectFolder === LOOKUP_TOKEN).pipe(
    Match.when(true, () => projectFolderFromLookup(read)),
    Match.when(false, () =>
      Result.map(
        rejectAnyTokens(rawProjectFolder, 'projectFolder'),
        () => read.path.resolve(read.configFolder, rawProjectFolder),
      )),
    Match.exhaustive,
  )

const anchoredExpansion = (projectFolder: string, path: Path.Path) => (expanded: string): string =>
  Match.value(expanded.length === 0).pipe(
    Match.when(true, () => ''),
    Match.when(false, () => path.resolve(projectFolder, expanded)),
    Match.exhaustive,
  )

const declarationEntryPoint = (
  mainEntryPointFilePath: string,
): Result.Result<string, MainEntryPointNotDeclarationError> =>
  Match.value(hasDeclarationFileExtension(mainEntryPointFilePath)).pipe(
    Match.when(true, () => Result.succeed(mainEntryPointFilePath)),
    Match.when(false, () => Result.fail(new MainEntryPointNotDeclarationError({ filePath: mainEntryPointFilePath }))),
    Match.exhaustive,
  )

/** The path settings whose tokens upstream expands, each with the setting name it reports. */
const checkedPathSettings: ReadonlyArray<readonly [string, (file: ConfigFile) => string | undefined]> = [
  ['reportFolder', (file) => file.apiReport?.reportFolder],
  ['reportTempFolder', (file) => file.apiReport?.reportTempFolder],
  ['apiJsonFilePath', (file) => file.docModel?.apiJsonFilePath],
  ['untrimmedFilePath', (file) => file.dtsRollup?.untrimmedFilePath],
  ['alphaTrimmedFilePath', (file) => file.dtsRollup?.alphaTrimmedFilePath],
  ['betaTrimmedFilePath', (file) => file.dtsRollup?.betaTrimmedFilePath],
  ['publicTrimmedFilePath', (file) => file.dtsRollup?.publicTrimmedFilePath],
]

const checkPathTokens = (
  validated: ConfigFile,
  tokenCtx: TokenContext,
  join: JoinSegments,
): Result.Result<void, UnresolvedTokenError> => {
  const settings = Arr.flatMap(checkedPathSettings, (entry) =>
    Option.match(Option.fromNullishOr(entry[1](validated)), {
      onNone: (): ReadonlyArray<readonly [string, string]> => [],
      onSome: (value) => [[entry[0], value] as const],
    }))
  return Result.map(
    Result.all(Arr.map(settings, ([fieldName, value]) => expandTokens(value, tokenCtx, fieldName, join))),
    () => undefined,
  )
}

const assembleConfig = (
  read: RawConfigRead,
  validated: ConfigFile,
  projectFolder: string,
): Result.Result<ExtractorConfig, ConfigDecodeError> => {
  const nearestPackage = read.packageJson
  const tokenCtx = buildTokenContext(
    projectFolder,
    Option.getOrUndefined(Option.map(nearestPackage, (found) => found.packageJson)),
  )
  const join: JoinSegments = (folder, rest) => read.path.join(folder, rest)
  const anchor = anchoredExpansion(projectFolder, read.path)
  const expand = (fieldName: string, raw: string | undefined): Result.Result<string, UnresolvedTokenError> =>
    Result.map(expandTokens(raw ?? '', tokenCtx, fieldName, join), anchor)
  const reportCfg: ApiReportConfig = Option.getOrElse(
    Option.fromUndefinedOr(validated.apiReport),
    (): ApiReportConfig => ({ enabled: false }),
  )
  const compilerOption = Option.fromNullishOr(validated.compiler)
  const overrideOption = Option.flatMap(compilerOption, (compiler) => Option.fromNullishOr(compiler.overrideTsconfig))
  const rawTsconfigFilePath = Option.flatMap(
    compilerOption,
    (compiler) => Option.fromUndefinedOr(compiler.tsconfigFilePath),
  ).pipe(Option.getOrUndefined)
  const packageBaseFolder = Option.getOrElse(Option.map(nearestPackage, (found) => found.folder), () => projectFolder)
  return Result.flatMap(
    Result.all([
      Result.flatMap(expand('mainEntryPointFilePath', validated.mainEntryPointFilePath), declarationEntryPoint),
      expand('tsconfigFilePath', rawTsconfigFilePath),
      buildReportConfigs(reportCfg, tokenCtx, join),
      checkPathTokens(validated, tokenCtx, join),
    ]),
    ([mainEntryPointFilePath, tsconfigFilePath, reportConfigs]) =>
      Result.map(
        Result.all([
          absolutePathOf(read.configFilePath),
          absolutePathOf(projectFolder),
          absolutePathOf(mainEntryPointFilePath),
          absolutePathOf(tsconfigFilePath),
          packageLocationOf(nearestPackage),
          apiReportSettingsOf(reportCfg, reportConfigs, projectFolder, read.path),
          dtsRollupSettingsOf(validated.dtsRollup, projectFolder, read.path),
          docModelSettingsOf(validated.docModel, projectFolder, read.path),
          tsdocMetadataSettingsOf(validated.tsdocMetadata, projectFolder, packageBaseFolder, read.path),
        ]),
        ([
          configFilePath,
          resolvedProjectFolder,
          resolvedMainEntryPointFilePath,
          resolvedTsconfigFilePath,
          packageLocation,
          apiReport,
          dtsRollup,
          docModel,
          tsdocMetadata,
        ]): ExtractorConfig => ({
          configFilePath,
          projectFolder: resolvedProjectFolder,
          packageLocation,
          mainEntryPointFilePath: resolvedMainEntryPointFilePath,
          bundledPackages: Option.getOrElse(
            Option.fromUndefinedOr(validated.bundledPackages),
            (): readonly string[] => [],
          ),
          tsconfigFilePath: resolvedTsconfigFilePath,
          overrideTsconfig: compilerOverrideOf(overrideOption.pipe(Option.getOrUndefined)),
          skipLibCheck: Option.getOrElse(
            Option.flatMap(
              Option.fromNullishOr(validated.compiler),
              (compiler) => Option.fromUndefinedOr(compiler.skipLibCheck),
            ),
            () => false,
          ),
          newlineKind: Option.getOrElse(Option.fromUndefinedOr(validated.newlineKind), () => 'crlf'),
          enumMemberOrder: Option.getOrElse(Option.fromUndefinedOr(validated.enumMemberOrder), () => 'by-name'),
          testMode: Option.getOrElse(Option.fromUndefinedOr(validated.testMode), () => false),
          quiet: Option.getOrElse(Option.fromUndefinedOr(validated.quiet), () => false),
          apiReport,
          docModel,
          dtsRollup,
          tsdocMetadata,
          messages: Option.getOrElse(Option.fromUndefinedOr(validated.messages), (): MessagesConfig => ({})),
        }),
      ),
  )
}

/** The one feature this engine refuses although the upstream schema accepts it (R27). */
const unsupportedFeatureOf = (validated: ConfigFile): Option.Option<UnsupportedFeatureError> =>
  Option.flatMap(
    Option.fromNullishOr(validated.docModel),
    (docModel) =>
      Match.value(docModel.enabled).pipe(
        Match.when(true, () => Option.some(new UnsupportedFeatureError({ feature: 'docModel.enabled' }))),
        Match.when(false, () => Option.none<UnsupportedFeatureError>()),
        Match.exhaustive,
      ),
  )

/**
 * Decodes the configuration the read phase gathered. Pure: the chain is anchored and merged
 * with the defaults, the merged record is validated, the tokens in its paths are expanded, and
 * the project folder is resolved — all from the read phase's data, with no I/O of its own.
 */
export const decodeExtractorConfig = (read: RawConfigRead): Result.Result<ExtractorConfig, ConfigDecodeError> => {
  const mergedRaw = Arr.reduce(
    read.links,
    emptyRecord,
    (accumulated, link) =>
      mergeConfigObjects(anchorRelativePaths(link.record, read.path.dirname(link.filePath), read.path), accumulated),
  )
  const withDefaults = mergeConfigObjects({ ...DEFAULT_CONFIG_RECORD }, mergedRaw)
  return Result.flatMap(
    Result.mapError(
      Schema.decodeUnknownResult(ConfigFile, { onExcessProperty: 'error' })(withDefaults),
      (error): ConfigSchemaValidationError | InternalInvariantError =>
        Option.getOrElse(
          Option.map(
            violationOf(error.issue),
            (violation) =>
              new ConfigSchemaValidationError({
                filePath: read.configFilePath,
                violations: [violation],
              }),
          ),
          () =>
            new InternalInvariantError({
              message: 'The configuration schema produced an issue kind the decoder does not render',
            }),
        ),
    ),
    (validated) =>
      Option.match(unsupportedFeatureOf(validated), {
        onSome: (refusal) => Result.fail(refusal),
        onNone: () =>
          Result.flatMap(
            projectFolderOf(read, validated),
            (folder) => assembleConfig(read, validated, folder),
          ),
      }),
  )
}

/** The manifest the configuration found, decoded once when the read phase read it. */
export const packageJsonOf = (config: ExtractorConfig): Option.Option<PackageJson> =>
  Match.value(config.packageLocation).pipe(
    Match.tag('PackageFound', (found) => Option.some(found.packageJson)),
    Match.tag('NoPackage', () => Option.none<PackageJson>()),
    Match.exhaustive,
  )

/** Whether the report writer collects forgotten exports, from either section that can ask for them. */
export const includeForgottenExportsOf = (config: ExtractorConfig): boolean =>
  Match.value(config.apiReport).pipe(
    Match.tag('ApiReportDisabled', () => false),
    Match.tag('ApiReportEnabled', (report) => report.includeForgottenExports),
    Match.exhaustive,
  ) ||
  Match.value(config.docModel).pipe(
    Match.tag('DocModelDisabled', (docModel) => docModel.includeForgottenExports),
    Match.tag('DocModelEnabled', (docModel) => docModel.includeForgottenExports),
    Match.exhaustive,
  )

/** The tags an AEDoc footer reports: the resolved table, or upstream's defaults when no report is written. */
export const tagsToReportOf = (config: ExtractorConfig): Readonly<Record<string, boolean>> =>
  Match.value(config.apiReport).pipe(
    Match.tag('ApiReportDisabled', () => DEFAULT_TAGS_TO_REPORT),
    Match.tag('ApiReportEnabled', (report) => report.tagsToReport),
    Match.exhaustive,
  )

/** Whether the rollup writer keeps its "excluded from this release type" comments. */
export const omitTrimmingCommentsOf = (config: ExtractorConfig): boolean =>
  Match.value(config.dtsRollup).pipe(
    Match.tag('DtsRollupDisabled', () => false),
    Match.tag('DtsRollupEnabled', (rollup) => rollup.omitTrimmingComments),
    Match.exhaustive,
  )

/** Whether an API report is written at all. */
export const reportEnabledOf = (config: ExtractorConfig): boolean =>
  Match.value(config.apiReport).pipe(
    Match.tag('ApiReportDisabled', () => false),
    Match.tag('ApiReportEnabled', () => true),
    Match.exhaustive,
  )
