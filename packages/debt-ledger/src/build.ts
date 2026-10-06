import { parse as parseJsonc } from '@std/jsonc'
import { OptIns, type OptIns as OptInsType, OptInsModule } from '@systemfsoftware/opt-in'
import { Array as Arr, Effect, Match, Option, Path, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import type { PlatformError } from 'effect/PlatformError'
import { runnerImport } from 'vite'
import { assembleLedger } from './assemble.js'
import { joinGrants, type OptInWithPackage } from './classify.js'
import { DebtLedgerConfig, type DebtLedgerConfig as Config } from './Config.schema.js'
import { ConfigUnreadable, type DebtLedgerError, EmptyRoot, MissingRoot } from './DebtLedgerError.schema.js'
import type { Entry } from './Entry.schema.js'
import { ConfigSeverity } from './Entry.schema.js'
import type { Ledger } from './Ledger.schema.js'
import { asRecord, type Raw } from './raw.js'
import { grantEntries, optInsWithPackage } from './scan-grants.js'
import { scanOxlintConfig } from './scan-oxlint.js'
import { scanRustFile } from './scan-rust.js'
import { scanStrykerConfig } from './scan-stryker.js'
import { scanTsFile } from './scan-ts.js'
import { scanTsconfigFile } from './scan-tsconfig.js'
import { scanVitestConfig } from './scan-vitest.js'
import { normalizePath } from './text.js'

export interface BuildResult {
  readonly dir: string
  readonly ledger: Ledger
  readonly mdPath: string
  readonly jsonPath: string
}

export type BuildError = PlatformError | DebtLedgerError
export type BuildEnv = FileSystem.FileSystem | Path.Path

export type Pair = readonly [string, string]

const DEFAULT_MD_PATH = 'docs/debt.md'
const DEFAULT_JSON_PATH = 'docs/debt.json'
const DEFAULT_EXCLUDES: ReadonlyArray<string> = [
  'node_modules/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/.git/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/.stryker-tmp/**',
]

interface Loaded {
  readonly file: string
  readonly full: string
  readonly source: string
}

const TS_EXTENSIONS: ReadonlyArray<string> = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']
const OXLINT_NAMES: ReadonlySet<string> = new Set([
  'oxlint.config.ts',
  'oxlint.config.js',
  'oxlint.config.mjs',
  'oxlint.config.cjs',
  '.oxlintrc.json',
  'oxlint.json',
])

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

const isTs = (name: string): boolean => Arr.some(TS_EXTENSIONS, (extension) => name.endsWith(extension))
const isRust = (name: string): boolean => name.endsWith('.rs')
const isOxlintConfig = (name: string): boolean => OXLINT_NAMES.has(name)
const isTsconfig = (name: string): boolean => name.startsWith('tsconfig') && name.endsWith('.json')
const isVitestConfig = (name: string): boolean => name.startsWith('vitest.config.')
const isStrykerConfig = (name: string): boolean => name.startsWith('stryker.conf')
const isOptIns = (name: string): boolean => name === 'opt-ins.ts'

const excludeDir = (pattern: string): string => pattern.replace(/^\*\*\//, '').replace(/\/\*\*$/, '')
const prefixMatch = (relative: string, dir: string): boolean => relative === dir || relative.startsWith(`${dir}/`)
const segmentMatch = (relative: string, dir: string): boolean => relative.includes(`/${dir}/`)
const matchesExclude = (relative: string, pattern: string): boolean =>
  prefixMatch(relative, excludeDir(pattern)) || segmentMatch(relative, excludeDir(pattern))

const excludedDirectory = (relative: string, patterns: ReadonlyArray<string>): boolean =>
  Arr.some(patterns, (pattern) => matchesExclude(`${relative}/`, pattern))

const moduleValue = (module: Raw): Raw =>
  Option.getOrElse(
    Option.flatMap(asRecord(module), (record) => Option.fromNullishOr(record['default'] ?? record['optIns'])),
    () => module,
  )

const describeError = (error: Raw): string => error instanceof Error ? error.message : 'unknown error'

const defaultOf = (spec: Raw): string =>
  Option.getOrElse(
    Option.flatMap(asRecord(spec), (record) => Schema.decodeUnknownOption(Schema.String)(record['default'])),
    () => 'error',
  )

const tsgoDefaultMap = (text: string): ReadonlyArray<Pair> => {
  const definitions = Option.flatMap(asRecord(parseJsonc(text)), (root) => asRecord(root['definitions']))
  const diagnostics = Option.flatMap(
    definitions,
    (root) => asRecord(root['effectLanguageServicePluginDiagnosticsDefinition']),
  )
  const properties = Option.flatMap(diagnostics, (root) => asRecord(root['properties']))
  return Option.getOrElse(
    Option.map(properties, (map) => Object.entries(map).map(([name, spec]) => [name, defaultOf(spec)] as const)),
    (): ReadonlyArray<Pair> => [],
  )
}

const presetSpecifier = (subpath: string): string => `@systemfsoftware/tsconfig${subpath.slice(1)}`

const specifierEntry = (dir: string, subpath: string, target: Raw): ReadonlyArray<Pair> =>
  subpath === './package.json'
    ? []
    : Option.match(Schema.decodeUnknownOption(Schema.String)(target), {
      onNone: () => [],
      onSome: (value) => [
        [presetSpecifier(subpath), `${dir}/node_modules/@systemfsoftware/tsconfig/${value.replace(/^\.\//, '')}`],
      ],
    })

const presetExports = (dir: string, text: string): ReadonlyArray<Pair> => {
  const exportsMap = Option.flatMap(asRecord(parseJsonc(text)), (root) => asRecord(root['exports']))
  return Option.getOrElse(
    Option.map(
      exportsMap,
      (map) => Object.entries(map).flatMap(([subpath, target]) => specifierEntry(dir, subpath, target)),
    ),
    (): ReadonlyArray<Pair> => [],
  )
}

const walk = (
  patterns: ReadonlyArray<string>,
  dir: string,
  relative: string,
): Effect.Effect<ReadonlyArray<string>, PlatformError, BuildEnv> =>
  Effect.gen(function*() {
    const fs = yield* Effect.service(FileSystem.FileSystem)
    const path = yield* Effect.service(Path.Path)
    const descend = (full: string, child: string): Effect.Effect<ReadonlyArray<string>, PlatformError, BuildEnv> =>
      excludedDirectory(child, patterns)
        ? Effect.succeed<ReadonlyArray<string>>([])
        : fs.readLink(full).pipe(
          Effect.option,
          Effect.flatMap((link) =>
            Option.isSome(link) ? Effect.succeed<ReadonlyArray<string>>([]) : walk(patterns, full, child)
          ),
        )
    const names = yield* fs.readDirectory(dir)
    const lists = yield* Effect.forEach(
      names,
      (name) => {
        const full = path.join(dir, name)
        const child = relative === '' ? name : `${relative}/${name}`
        return fs.stat(full).pipe(
          Effect.flatMap((info) =>
            Match.value(info.type).pipe(
              Match.when('Directory', () => descend(full, child)),
              Match.orElse(() => Effect.succeed<ReadonlyArray<string>>([full])),
            )
          ),
        )
      },
      { concurrency: 1 },
    )
    return Arr.flatten(lists)
  })

const readText = (full: string): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem> =>
  Effect.service(FileSystem.FileSystem).pipe(Effect.flatMap((fs) => fs.readFileString(full).pipe(Effect.option)))

const loadGroup = (
  dir: string,
  paths: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<Loaded>, PlatformError, BuildEnv> =>
  Effect.gen(function*() {
    const fs = yield* Effect.service(FileSystem.FileSystem)
    const path = yield* Effect.service(Path.Path)
    return yield* Effect.forEach(
      paths,
      (full) =>
        fs.readFileString(full).pipe(
          Effect.map((source) => ({ file: normalizePath(path.relative(dir, full)), full, source })),
        ),
      { concurrency: 1 },
    )
  })

const importModule = (full: string): Effect.Effect<Raw, never> =>
  Effect.promise(() => runnerImport<Raw>(full)).pipe(Effect.map((result) => result.module))

const loadOptIns = (input: Loaded): Effect.Effect<OptInsType, never> =>
  importModule(input.full).pipe(
    Effect.flatMap((module) => Schema.decodeUnknownEffect(OptInsModule)(module)),
    Effect.flatMap((shaped) => Schema.decodeUnknownEffect(OptIns)(shaped.default ?? shaped.optIns)),
    Effect.orElseSucceed((): OptInsType => []),
  )

const loadConfig = (dir: string): Effect.Effect<Config, DebtLedgerError> =>
  Effect.tryPromise({
    try: () => runnerImport<Raw>(`${dir}/debt-ledger.config.ts`),
    catch: (error) => ConfigUnreadable.make({ path: `${dir}/debt-ledger.config.ts`, message: describeError(error) }),
  }).pipe(
    Effect.flatMap((result) => {
      const value = moduleValue(result.module)
      return Schema.decodeUnknownEffect(DebtLedgerConfig)(value).pipe(
        Effect.mapError((error) =>
          ConfigUnreadable.make({ path: `${dir}/debt-ledger.config.ts`, message: describeError(error) })
        ),
      )
    }),
  )

const readPairs = (
  paths: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<Pair>, never, FileSystem.FileSystem> =>
  Effect.forEach(
    paths,
    (full) => readText(full).pipe(Effect.map((maybe) => Option.map(maybe, (text) => [full, text] as const))),
    { concurrency: 1 },
  ).pipe(Effect.map((options) => Arr.getSomes(options)))

const resolveSpecifier = (presets: ReadonlyArray<Pair>, specifier: string, fromDir: string): Option.Option<string> =>
  specifier.startsWith('.')
    ? Option.some(`${fromDir}/${specifier.replace(/\/\.\//, '/')}`)
    : Option.map(Arr.findFirst(presets, ([key]) => key === specifier), ([, value]) => value)

const channelOf = (present: boolean, name: string): ReadonlyArray<string> => present ? [name] : []

const ensureNonEmpty = (empty: boolean, root: string): Effect.Effect<void, EmptyRoot> =>
  empty ? Effect.fail(EmptyRoot.make({ root })) : Effect.void

const tsgoSchemaPath = (dir: string, config: Config): string =>
  config.tsgoSchema === undefined ? `${dir}/node_modules/@effect/tsgo/schema.json` : `${dir}/${config.tsgoSchema}`

const mdPathOf = (path: Path.Path, dir: string, config: Config): string =>
  path.resolve(dir, config.mdPath ?? DEFAULT_MD_PATH)

const jsonPathOf = (path: Path.Path, dir: string, config: Config): string =>
  path.resolve(dir, config.jsonPath ?? DEFAULT_JSON_PATH)

const configSeverityOf = (entry: Entry): Option.Option<ConfigSeverity> =>
  Match.value(entry).pipe(
    Match.tag('ConfigSeverity', (item): Option.Option<ConfigSeverity> => Option.some(item)),
    Match.orElse(() => Option.none()),
  )

const packageOf = (file: string): string => {
  const at = file.indexOf('/opt-ins.ts')
  return at === -1 ? file : file.slice(0, at)
}

const importEntries = <A>(
  files: ReadonlyArray<Loaded>,
  scan: (input: { readonly file: string; readonly value: Raw }) => ReadonlyArray<A>,
): Effect.Effect<ReadonlyArray<A>, never> =>
  Effect.forEach(
    files,
    (input) =>
      importModule(input.full).pipe(Effect.map((value) => scan({ file: input.file, value: moduleValue(value) }))),
    { concurrency: 1 },
  ).pipe(Effect.map(Arr.flatten))

export const build = (dir: string): Effect.Effect<BuildResult, BuildError, BuildEnv> =>
  Effect.gen(function*() {
    const fs = yield* Effect.service(FileSystem.FileSystem)
    const path = yield* Effect.service(Path.Path)
    const config = yield* loadConfig(dir)

    const patterns = [...DEFAULT_EXCLUDES, ...config.exclude]
    const all = yield* Effect.forEach(
      config.roots,
      (root) => {
        const full = path.resolve(dir, root)
        return fs.stat(full).pipe(
          Effect.flatMap((info) =>
            Match.value(info.type).pipe(
              Match.when('Directory', () => walk(patterns, full, '')),
              Match.orElse(() => Effect.fail(MissingRoot.make({ root }))),
            )
          ),
        )
      },
      { concurrency: 1 },
    ).pipe(Effect.map(Arr.flatten))

    const files = Arr.filter(
      all,
      (full) => !Arr.some(patterns, (pattern) => matchesExclude(normalizePath(path.relative(dir, full)), pattern)),
    )
    yield* ensureNonEmpty(files.length === 0, config.roots.join(', '))

    const byBase = (predicate: (name: string) => boolean): ReadonlyArray<string> =>
      Arr.filter(files, (full) => predicate(baseName(full)))

    const tsFiles = yield* loadGroup(dir, byBase(isTs))
    const rustFiles = yield* loadGroup(dir, byBase(isRust))
    const oxlintFiles = yield* loadGroup(dir, byBase(isOxlintConfig))
    const tsconfigFiles = yield* loadGroup(dir, byBase(isTsconfig))
    const vitestFiles = yield* loadGroup(dir, byBase(isVitestConfig))
    const strykerFiles = yield* loadGroup(dir, byBase(isStrykerConfig))
    const optInsFiles = yield* loadGroup(dir, byBase(isOptIns))

    const presetPackage = yield* readText(`${dir}/node_modules/@systemfsoftware/tsconfig/package.json`)
    const presets = Option.getOrElse(
      Option.map(presetPackage, (text) => presetExports(dir, text)),
      (): ReadonlyArray<Pair> => [],
    )
    const tsgoText = yield* readText(tsgoSchemaPath(dir, config))
    const tsgoDefaults = Option.getOrElse(Option.map(tsgoText, tsgoDefaultMap), (): ReadonlyArray<Pair> => [])
    const presetTexts = yield* readPairs(Arr.dedupe(Arr.map(presets, ([, value]) => value)))

    const tsEntries = Arr.flatMap(tsFiles, (input) => scanTsFile(input))
    const rustEntries = Arr.flatMap(rustFiles, (input) => scanRustFile(input))
    const oxlintEntries = yield* importEntries(oxlintFiles, scanOxlintConfig)
    const vitestEntries = yield* importEntries(vitestFiles, scanVitestConfig)
    const strykerEntries = yield* importEntries(strykerFiles, scanStrykerConfig)

    const optIns = yield* Effect.forEach(optInsFiles, loadOptIns, { concurrency: 1 })
    const zipped = Arr.zip(optInsFiles, optIns)
    const optInsPackages: ReadonlyArray<OptInWithPackage> = Arr.flatten(
      Arr.map(zipped, ([input, items]) => optInsWithPackage({ package: packageOf(input.file), optIns: items })),
    )
    const grantEntryList = Arr.flatten(
      Arr.map(zipped, ([input, items]) => grantEntries({ package: packageOf(input.file), optIns: items })),
    )

    const readPreset = (candidate: string): Option.Option<string> =>
      Option.map(Arr.findFirst(presetTexts, ([key]) => key === candidate), ([, text]) => text)
    const tsconfigEntries = Arr.flatMap(tsconfigFiles, (input) =>
      scanTsconfigFile({
        file: input.file,
        path: input.full,
        text: input.source,
        readText: readPreset,
        resolveExtends: (specifier, fromDir) => resolveSpecifier(presets, specifier, fromDir),
        tsgoDefaults,
      }))

    const configEntries = Arr.getSomes(
      Arr.map([...oxlintEntries, ...tsconfigEntries, ...vitestEntries, ...strykerEntries], configSeverityOf),
    )
    const index = joinGrants(configEntries, optInsPackages)
    const entries: ReadonlyArray<Entry> = [
      ...tsEntries,
      ...rustEntries,
      ...oxlintEntries,
      ...tsconfigEntries,
      ...vitestEntries,
      ...strykerEntries,
      ...grantEntryList,
    ]

    const channels = [
      ...channelOf(tsFiles.length > 0, 'typescript'),
      ...channelOf(rustFiles.length > 0, 'rust'),
      ...channelOf(oxlintFiles.length > 0, 'oxlint'),
      ...channelOf(tsconfigFiles.length > 0, 'tsconfig'),
      ...channelOf(vitestFiles.length > 0, 'vitest'),
      ...channelOf(strykerFiles.length > 0, 'stryker'),
      ...channelOf(optInsFiles.length > 0, 'opt-ins'),
    ]
    yield* ensureNonEmpty(channels.length === 0, config.roots.join(', '))

    const scannedCount = tsFiles.length + rustFiles.length + oxlintFiles.length + tsconfigFiles.length +
      vitestFiles.length + strykerFiles.length + optInsFiles.length

    return {
      dir,
      ledger: assembleLedger({ entries, index, channels, fileCount: scannedCount }),
      mdPath: mdPathOf(path, dir, config),
      jsonPath: jsonPathOf(path, dir, config),
    }
  })
