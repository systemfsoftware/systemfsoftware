import { Match, Schema } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as Option from 'effect/Option'
import type * as Path from 'effect/Path'
import * as Result from 'effect/Result'

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
import type {
  ApiReportConfig,
  ApiReportVariant,
  DocModelConfig,
  DtsRollupConfig,
  MessagesConfig,
  TsdocMetadataConfig,
} from './config-file.schema.js'
import { ConfigFile } from './config-file.schema.js'
import { isConfigRecord } from './config-record.js'
import { hasDeclarationFileExtension } from './declaration-file.js'
import { DEFAULT_CONFIG_RECORD } from './defaults.js'
import type { ExtractorConfig, ExtractorReportConfig } from './extractor-config.schema.js'
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

/** The nearest `package.json` the read phase found, and the record it holds. */
export interface RawPackageJson {
  readonly folder: string
  readonly record: MutableJsonRecord
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
  readonly packageJson: Option.Option<RawPackageJson>
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

const anchorPath = (value: Schema.Json | undefined, folder: string, path: Path.Path): Schema.Json | undefined =>
  Option.match(Option.filter(Option.fromNullishOr(value), Schema.is(Schema.String)), {
    onNone: () => value,
    onSome: (raw) => anchorIfRelative(raw, folder, path),
  })

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

const anchorCompiler = (
  compiler: Schema.Json | undefined,
  folder: string,
  path: Path.Path,
): Schema.Json | undefined =>
  Option.match(Option.filter(Option.fromNullishOr(compiler), isConfigRecord), {
    onNone: () => compiler,
    onSome: (record) =>
      assignIfPresent(record, 'tsconfigFilePath', anchorPath(record['tsconfigFilePath'], folder, path)),
  })

const anchorApiReport = (
  apiReport: Schema.Json | undefined,
  folder: string,
  path: Path.Path,
): Schema.Json | undefined =>
  Option.match(Option.filter(Option.fromNullishOr(apiReport), isConfigRecord), {
    onNone: () => apiReport,
    onSome: (record) =>
      assignIfPresent(
        assignIfPresent(record, 'reportFolder', anchorPath(record['reportFolder'], folder, path)),
        'reportTempFolder',
        anchorPath(record['reportTempFolder'], folder, path),
      ),
  })

const anchorDocModel = (
  docModel: Schema.Json | undefined,
  folder: string,
  path: Path.Path,
): Schema.Json | undefined =>
  Option.match(Option.filter(Option.fromNullishOr(docModel), isConfigRecord), {
    onNone: () => docModel,
    onSome: (record) => assignIfPresent(record, 'apiJsonFilePath', anchorPath(record['apiJsonFilePath'], folder, path)),
  })

const dtsRollupPathKeys = [
  'untrimmedFilePath',
  'alphaTrimmedFilePath',
  'betaTrimmedFilePath',
  'publicTrimmedFilePath',
] as const

const anchorDtsRollup = (
  dtsRollup: Schema.Json | undefined,
  folder: string,
  path: Path.Path,
): Schema.Json | undefined =>
  Option.match(Option.filter(Option.fromNullishOr(dtsRollup), isConfigRecord), {
    onNone: () => dtsRollup,
    onSome: (record) =>
      Arr.reduce(dtsRollupPathKeys, record, (anchored, key) =>
        assignIfPresent(anchored, key, anchorPath(record[key], folder, path))),
  })

const anchorTsdocMetadata = (
  tsdocMetadata: Schema.Json | undefined,
  folder: string,
  path: Path.Path,
): Schema.Json | undefined =>
  Option.match(Option.filter(Option.fromNullishOr(tsdocMetadata), isConfigRecord), {
    onNone: () => tsdocMetadata,
    onSome: (record) =>
      assignIfPresent(record, 'tsdocMetadataFilePath', anchorPath(record['tsdocMetadataFilePath'], folder, path)),
  })

type AnchoredSection = readonly [
  key: 'compiler' | 'apiReport' | 'docModel' | 'dtsRollup' | 'tsdocMetadata',
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
 * merge below compares like with like.
 */
export const anchorRelativePaths = dual<
  (folder: string, path: Path.Path) => (config: MutableJsonRecord) => MutableJsonRecord,
  (config: MutableJsonRecord, folder: string, path: Path.Path) => MutableJsonRecord
>(3, (
  config: MutableJsonRecord,
  folder: string,
  path: Path.Path,
): MutableJsonRecord =>
  assignIfPresent(
    Arr.reduce(
      anchoredSections,
      config,
      (record, [key, anchor]) => assignIfPresent(record, key, anchor(record[key], folder, path)),
    ),
    'projectFolder',
    anchorPath(config['projectFolder'], folder, path),
  ))

const packageNameOf = (packageJson: MutableJsonRecord | undefined): string =>
  Option.getOrElse(
    Option.flatMap(
      Option.fromNullishOr(packageJson),
      (record) => Option.filter(Option.fromNullishOr(record['name']), Schema.is(Schema.String)),
    ),
    () => UNKNOWN_PACKAGE_NAME,
  )

const buildTokenContext = (
  projectFolder: string,
  packageJson: MutableJsonRecord | undefined,
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

const extractOverrideTsconfig = (compiler: Schema.Json | undefined): Schema.Json | undefined =>
  Option.getOrUndefined(
    Option.flatMap(
      Option.filter(Option.fromNullishOr(compiler), isConfigRecord),
      (record) => Option.fromNullishOr(record['overrideTsconfig']),
    ),
  )

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
  overrideTsconfig: Schema.Json | undefined,
  projectFolder: string,
): Result.Result<ExtractorConfig, ConfigDecodeError> => {
  const nearestPackage = read.packageJson
  const packageJson = Option.getOrUndefined(Option.map(nearestPackage, (found) => found.record))
  const tokenCtx = buildTokenContext(projectFolder, packageJson)
  const join: JoinSegments = (folder, rest) => read.path.join(folder, rest)
  const anchor = anchoredExpansion(projectFolder, read.path)
  const expand = (fieldName: string, raw: string | undefined): Result.Result<string, UnresolvedTokenError> =>
    Result.map(expandTokens(raw ?? '', tokenCtx, fieldName, join), anchor)
  const reportCfg: ApiReportConfig = Option.getOrElse(
    Option.fromUndefinedOr(validated.apiReport),
    (): ApiReportConfig => ({ enabled: false }),
  )
  return Result.map(
    Result.all([
      Result.flatMap(expand('mainEntryPointFilePath', validated.mainEntryPointFilePath), declarationEntryPoint),
      expand(
        'tsconfigFilePath',
        Option.fromNullishOr(validated.compiler).pipe(
          Option.map((compiler) => compiler.tsconfigFilePath),
          Option.getOrUndefined,
        ),
      ),
      buildReportConfigs(reportCfg, tokenCtx, join),
      checkPathTokens(validated, tokenCtx, join),
    ]),
    ([mainEntryPointFilePath, tsconfigFilePath, reportConfigs]): ExtractorConfig => ({
      configFilePath: read.configFilePath,
      projectFolder,
      packageFolder: Option.getOrUndefined(Option.map(nearestPackage, (found) => found.folder)),
      packageJson,
      mainEntryPointFilePath,
      bundledPackages: Option.getOrElse(Option.fromUndefinedOr(validated.bundledPackages), (): readonly string[] => []),
      tsconfigFilePath,
      overrideTsconfig,
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
      apiReport: {
        ...reportCfg,
        reportConfigs,
      },
      docModel: Option.getOrElse(
        Option.fromUndefinedOr(validated.docModel),
        (): DocModelConfig => ({ enabled: false }),
      ),
      dtsRollup: Option.getOrElse(
        Option.fromUndefinedOr(validated.dtsRollup),
        (): DtsRollupConfig => ({ enabled: false }),
      ),
      tsdocMetadata: Option.getOrElse(
        Option.fromUndefinedOr(validated.tsdocMetadata),
        (): TsdocMetadataConfig => ({ enabled: false }),
      ),
      messages: Option.getOrElse(Option.fromUndefinedOr(validated.messages), (): MessagesConfig => ({})),
    }),
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
  const overrideTsconfig = extractOverrideTsconfig(withDefaults['compiler'])
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
            (folder) => assembleConfig(read, validated, overrideTsconfig, folder),
          ),
      }),
  )
}
