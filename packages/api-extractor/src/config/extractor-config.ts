import { Schema } from 'effect'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Result from 'effect/Result'
import {
  CircularConfigExtendsError,
  ConfigFileNotFound,
  ConfigJsonSyntaxError,
  ConfigSchemaValidationError,
} from '../errors/config.js'
import type {
  ApiReportConfig,
  ApiReportVariant,
  DocModelConfig,
  DtsRollupConfig,
  EnumMemberOrder,
  MessagesConfig,
  NewlineKind,
  TsdocMetadataConfig,
} from './config-file.schema.js'
import { ConfigFile } from './config-file.schema.js'
import { DEFAULT_CONFIG_RECORD } from './defaults.js'
import type { JsonRecord } from './json-record.schema.js'
import { JsonRecordFromString } from './json-record.schema.js'
import type { TokenContext } from './tokens.js'
import { expandTokens, unscopedPackageName } from './tokens.js'

export interface ExtractorReportConfig {
  readonly variant: ApiReportVariant
  readonly fileName: string
}

export interface ExtractorConfig {
  readonly configFilePath: string
  readonly projectFolder: string
  readonly packageFolder: string | undefined
  readonly packageJson: Record<string, Schema.Json> | undefined
  readonly mainEntryPointFilePath: string
  readonly bundledPackages: readonly string[]
  readonly tsconfigFilePath: string
  readonly overrideTsconfig: Schema.Json | undefined
  readonly skipLibCheck: boolean
  readonly newlineKind: NewlineKind
  readonly enumMemberOrder: EnumMemberOrder
  readonly testMode: boolean
  readonly quiet: boolean
  readonly apiReport: ApiReportConfig & {
    readonly reportConfigs: readonly ExtractorReportConfig[]
  }
  readonly docModel: DocModelConfig
  readonly dtsRollup: DtsRollupConfig
  readonly tsdocMetadata: TsdocMetadataConfig & {
    readonly filePath: string
  }
  readonly messages: MessagesConfig
}

export type MutableJsonRecord = Record<string, Schema.Json>

export const isConfigRecord = (u: Schema.Json): u is MutableJsonRecord =>
  typeof u === 'object' && u !== null && !Array.isArray(u)

const mergeKey = (
  result: MutableJsonRecord,
  key: string,
  derivedVal: Schema.Json,
): void => {
  const baseVal = result[key]
  const canRecurse = baseVal !== undefined && isConfigRecord(baseVal) && isConfigRecord(derivedVal)
  result[key] = canRecurse ? mergeConfigObjects(baseVal, derivedVal) : derivedVal
}

export const mergeConfigObjects = (
  base: MutableJsonRecord,
  derived: MutableJsonRecord,
): MutableJsonRecord => {
  const result: MutableJsonRecord = { ...base }
  for (const [key, val] of Object.entries(derived)) {
    mergeKey(result, key, val)
  }
  return result
}

export const splitExtends = (
  config: MutableJsonRecord,
): { readonly extendsSpecifier: string | undefined; readonly stripped: MutableJsonRecord } => {
  const { extends: extendsVal, ...stripped } = config
  const isString = typeof extendsVal === 'string'
  const isNonEmpty = isString && extendsVal.length > 0
  const extendsSpecifier = isNonEmpty ? extendsVal : undefined
  return { extendsSpecifier, stripped }
}

const anchorIfRelative = (val: string, folder: string, path: Path.Path): string => {
  const isAbs = path.isAbsolute(val)
  if (isAbs) return val
  const isToken = val.startsWith('<projectFolder>')
  return isToken ? val : path.join(folder, val)
}

const anchorPath = (value: Schema.Json | undefined, folder: string, path: Path.Path): Schema.Json | undefined =>
  typeof value === 'string' ? anchorIfRelative(value, folder, path) : value

const cloneAndAssign = (record: MutableJsonRecord, key: string, val: Schema.Json | undefined): MutableJsonRecord => {
  const copy: MutableJsonRecord = { ...record }
  if (val !== undefined) {
    copy[key] = val
  }
  return copy
}

const anchorCompiler = (
  compiler: Schema.Json | undefined,
  folder: string,
  path: Path.Path,
): Schema.Json | undefined => {
  if (compiler === undefined || !isConfigRecord(compiler)) return compiler
  const tsconfig = anchorPath(compiler['tsconfigFilePath'], folder, path)
  return cloneAndAssign(compiler, 'tsconfigFilePath', tsconfig)
}

const anchorApiReport = (
  apiReport: Schema.Json | undefined,
  folder: string,
  path: Path.Path,
): Schema.Json | undefined => {
  if (apiReport === undefined || !isConfigRecord(apiReport)) return apiReport
  const reportFolder = anchorPath(apiReport['reportFolder'], folder, path)
  const reportTempFolder = anchorPath(apiReport['reportTempFolder'], folder, path)
  const withFolder = cloneAndAssign(apiReport, 'reportFolder', reportFolder)
  return cloneAndAssign(withFolder, 'reportTempFolder', reportTempFolder)
}

const anchorDocModel = (
  docModel: Schema.Json | undefined,
  folder: string,
  path: Path.Path,
): Schema.Json | undefined => {
  if (docModel === undefined || !isConfigRecord(docModel)) return docModel
  const apiJsonFilePath = anchorPath(docModel['apiJsonFilePath'], folder, path)
  return cloneAndAssign(docModel, 'apiJsonFilePath', apiJsonFilePath)
}

const anchorDtsRollup = (
  dtsRollup: Schema.Json | undefined,
  folder: string,
  path: Path.Path,
): Schema.Json | undefined => {
  if (dtsRollup === undefined || !isConfigRecord(dtsRollup)) return dtsRollup
  const untrimmed = anchorPath(dtsRollup['untrimmedFilePath'], folder, path)
  const alpha = anchorPath(dtsRollup['alphaTrimmedFilePath'], folder, path)
  const beta = anchorPath(dtsRollup['betaTrimmedFilePath'], folder, path)
  const pub = anchorPath(dtsRollup['publicTrimmedFilePath'], folder, path)
  const s1 = cloneAndAssign(dtsRollup, 'untrimmedFilePath', untrimmed)
  const s2 = cloneAndAssign(s1, 'alphaTrimmedFilePath', alpha)
  const s3 = cloneAndAssign(s2, 'betaTrimmedFilePath', beta)
  return cloneAndAssign(s3, 'publicTrimmedFilePath', pub)
}

const anchorTsdocMetadata = (
  tsdocMetadata: Schema.Json | undefined,
  folder: string,
  path: Path.Path,
): Schema.Json | undefined => {
  if (tsdocMetadata === undefined || !isConfigRecord(tsdocMetadata)) return tsdocMetadata
  const tsdocMetadataFilePath = anchorPath(tsdocMetadata['tsdocMetadataFilePath'], folder, path)
  return cloneAndAssign(tsdocMetadata, 'tsdocMetadataFilePath', tsdocMetadataFilePath)
}

export const anchorRelativePaths = (
  config: MutableJsonRecord,
  folder: string,
  path: Path.Path,
): MutableJsonRecord => {
  const c = anchorCompiler(config['compiler'], folder, path)
  const a = anchorApiReport(config['apiReport'], folder, path)
  const dm = anchorDocModel(config['docModel'], folder, path)
  const dr = anchorDtsRollup(config['dtsRollup'], folder, path)
  const tm = anchorTsdocMetadata(config['tsdocMetadata'], folder, path)
  const r1 = cloneAndAssign(config, 'compiler', c)
  const r2 = cloneAndAssign(r1, 'apiReport', a)
  const r3 = cloneAndAssign(r2, 'docModel', dm)
  const r4 = cloneAndAssign(r3, 'dtsRollup', dr)
  return cloneAndAssign(r4, 'tsdocMetadata', tm)
}

const toSyntaxError = (filePath: string, err: Schema.SchemaError) =>
  new ConfigJsonSyntaxError({ filePath, cause: err.message })

const toFileError = (filePath: string, err: PlatformError) =>
  new ConfigJsonSyntaxError({ filePath, cause: err.message })

export const readConfigJson = (
  filePath: string,
): Effect.Effect<MutableJsonRecord, ConfigFileNotFound | ConfigJsonSyntaxError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const exists = yield* fs.exists(filePath).pipe(Effect.orElseSucceed(() => false))
    if (!exists) {
      return yield* new ConfigFileNotFound({ filePath })
    }
    const content = yield* fs.readFileString(filePath).pipe(
      Effect.mapError((err) => toFileError(filePath, err)),
    )
    const parsed: JsonRecord = yield* Schema.decodeEffect(JsonRecordFromString)(content).pipe(
      Effect.mapError((err) => toSyntaxError(filePath, err)),
    )
    const result: MutableJsonRecord = { ...parsed }
    return result
  })

const resolveExtendsTarget = (
  specifier: string,
  fromFolder: string,
  path: Path.Path,
): string => {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../')
  return isRelative ? path.resolve(fromFolder, specifier) : specifier
}

export const walkExtendsChain = (
  entryPath: string,
  chain: readonly string[] = [],
  accumulated: MutableJsonRecord = {},
): Effect.Effect<
  MutableJsonRecord,
  CircularConfigExtendsError | ConfigFileNotFound | ConfigJsonSyntaxError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const resolvedPath = path.resolve(entryPath)
    if (chain.includes(resolvedPath)) {
      const fullChain = [...chain, resolvedPath]
      return yield* new CircularConfigExtendsError({ chain: fullChain })
    }
    const nextChain = [...chain, resolvedPath]
    const raw = yield* readConfigJson(resolvedPath)
    const { extendsSpecifier, stripped } = splitExtends(raw)
    const folder = path.dirname(resolvedPath)
    const anchored = anchorRelativePaths(stripped, folder, path)
    const merged = mergeConfigObjects(anchored, accumulated)

    if (extendsSpecifier === undefined) {
      return merged
    }
    const nextTarget = resolveExtendsTarget(extendsSpecifier, folder, path)
    return yield* walkExtendsChain(nextTarget, nextChain, merged)
  })

const defaultReportConfigs = (
  reportFileNameBase: string,
  variants: readonly ApiReportVariant[],
  tokenCtx: TokenContext,
  configPath: string,
  join: (folder: string, rest: string) => string,
): readonly ExtractorReportConfig[] =>
  variants.map((variant) => {
    const suffix = variant === 'complete' ? '.api.md' : `.${variant}.api.md`
    const rawName = `${reportFileNameBase}${suffix}`
    const expanded = expandTokens(rawName, tokenCtx, configPath, join)
    const fileName = Result.isSuccess(expanded) ? expanded.success : rawName
    return { variant, fileName }
  })

const probeTsconfigInFolder = (
  folder: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<Option.Option<string>> =>
  fs.exists(path.join(folder, 'tsconfig.json')).pipe(
    Effect.map((exists) => (exists ? Option.some(folder) : Option.none())),
    Effect.orElseSucceed(() => Option.none()),
  )

const findNearestTsconfig = (
  startFolder: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<string, ConfigSchemaValidationError> =>
  probeTsconfigInFolder(startFolder, fs, path).pipe(
    Effect.flatMap((opt) => {
      if (Option.isSome(opt)) {
        return Effect.succeed(opt.value)
      }
      const parent = path.dirname(startFolder)
      const atRoot = parent.length === 0 || parent === startFolder
      return atRoot
        ? new ConfigSchemaValidationError({
          filePath: startFolder,
          issues: ['Could not find tsconfig.json in parent folders of <lookup>'],
        })
        : findNearestTsconfig(parent, fs, path)
    }),
  )

const probePackageJsonInFolder = (
  folder: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<Option.Option<{ readonly folder: string; readonly packageJson: MutableJsonRecord }>> =>
  fs.readFileString(path.join(folder, 'package.json')).pipe(
    Effect.flatMap((content) => Schema.decodeEffect(JsonRecordFromString)(content)),
    Effect.map((parsed) => Option.some({ folder, packageJson: { ...parsed } })),
    Effect.orElseSucceed(() => Option.none()),
  )

const findNearestPackageJson = (
  startFolder: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<Option.Option<{ readonly folder: string; readonly packageJson: MutableJsonRecord }>> =>
  probePackageJsonInFolder(startFolder, fs, path).pipe(
    Effect.flatMap((opt) => {
      if (Option.isSome(opt)) {
        return Effect.succeed(opt)
      }
      const parent = path.dirname(startFolder)
      const atRoot = parent.length === 0 || parent === startFolder
      return atRoot ? Effect.succeedNone : findNearestPackageJson(parent, fs, path)
    }),
  )

const buildTokenContext = (
  projectFolder: string,
  packageJson: MutableJsonRecord | undefined,
): TokenContext => {
  const packageNameVal = packageJson?.['name']
  const packageName = typeof packageNameVal === 'string' ? packageNameVal : 'unknown-package'
  return {
    projectFolder,
    packageName,
    unscopedPackageName: unscopedPackageName(packageName),
  }
}

const buildReportConfigs = (
  reportCfg: ApiReportConfig,
  tokenCtx: TokenContext,
  resolvedConfigPath: string,
  join: (folder: string, rest: string) => string,
): readonly ExtractorReportConfig[] => {
  const variants = reportCfg.reportVariants ?? ['complete']
  const rawFileName = reportCfg.reportFileName ?? '<unscopedPackageName>'
  const reportBase = rawFileName.replace(/\.api\.md$/, '')
  return defaultReportConfigs(reportBase, variants, tokenCtx, resolvedConfigPath, join)
}

const extractOverrideTsconfig = (
  compiler: Schema.Json | undefined,
): Schema.Json | undefined => {
  if (compiler === undefined || !isConfigRecord(compiler)) return undefined
  return compiler['overrideTsconfig']
}

export const loadExtractorConfig = (
  filePath: string,
): Effect.Effect<
  ExtractorConfig,
  ConfigFileNotFound | ConfigJsonSyntaxError | ConfigSchemaValidationError | CircularConfigExtendsError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const resolvedConfigPath = path.resolve(filePath)
    const configFolder = path.dirname(resolvedConfigPath)

    const mergedRaw = yield* walkExtendsChain(resolvedConfigPath)
    const defaultsAsRecord: MutableJsonRecord = { ...DEFAULT_CONFIG_RECORD }
    const withDefaults = mergeConfigObjects(defaultsAsRecord, mergedRaw)

    const validated = yield* Schema.decodeEffect(ConfigFile)(withDefaults).pipe(
      Effect.mapError((err) =>
        new ConfigSchemaValidationError({ filePath: resolvedConfigPath, issues: [err.message] })
      ),
    )

    const rawProjectFolder = validated.projectFolder ?? '.'
    const projectFolder = rawProjectFolder === '<lookup>'
      ? yield* findNearestTsconfig(configFolder, fs, path)
      : path.resolve(configFolder, rawProjectFolder)

    const nearestPkg = yield* findNearestPackageJson(configFolder, fs, path)
    const packageFolder = Option.isSome(nearestPkg) ? nearestPkg.value.folder : undefined
    const packageJson = Option.isSome(nearestPkg) ? nearestPkg.value.packageJson : undefined

    const tokenCtx = buildTokenContext(projectFolder, packageJson)

    const expand = (val: string | undefined): string => {
      const isPresent = typeof val === 'string' && val.length > 0
      if (!isPresent) return ''
      const res = expandTokens(val, tokenCtx, resolvedConfigPath, path.join)
      return Result.isSuccess(res) ? path.resolve(projectFolder, res.success) : val
    }

    const mainEntryPoint = expand(validated.mainEntryPointFilePath)
    const tsconfigPath = expand(validated.compiler?.tsconfigFilePath)

    const reportCfg = validated.apiReport ?? { enabled: false }
    const reportConfigs = buildReportConfigs(reportCfg, tokenCtx, resolvedConfigPath, path.join)
    const overrideTsconfig = extractOverrideTsconfig(withDefaults['compiler'])

    return {
      configFilePath: resolvedConfigPath,
      projectFolder,
      packageFolder,
      packageJson,
      mainEntryPointFilePath: mainEntryPoint,
      bundledPackages: validated.bundledPackages ?? [],
      tsconfigFilePath: tsconfigPath,
      overrideTsconfig,
      skipLibCheck: validated.compiler?.skipLibCheck ?? false,
      newlineKind: validated.newlineKind ?? 'crlf',
      enumMemberOrder: validated.enumMemberOrder ?? 'by-name',
      testMode: validated.testMode ?? false,
      quiet: validated.quiet ?? false,
      apiReport: {
        ...reportCfg,
        reportConfigs,
      },
      docModel: validated.docModel ?? { enabled: false },
      dtsRollup: validated.dtsRollup ?? { enabled: false },
      tsdocMetadata: {
        ...validated.tsdocMetadata,
        filePath: expand(validated.tsdocMetadata?.tsdocMetadataFilePath),
      },
      messages: validated.messages ?? {},
    }
  })
