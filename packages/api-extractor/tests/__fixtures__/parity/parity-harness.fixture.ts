import { ExtractorConfig, Extractor as UpstreamExtractor } from '@microsoft/api-extractor'
import { layer as nodePathLayer } from '@effect/platform-node/NodePath'
import { Extractor } from '@systemfsoftware/api-extractor'
import { Effect, Layer, Match, Option, Result, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import * as os from 'node:os'
import { fileURLToPath } from 'node:url'

import type { ParityFile, ParityPackage } from '../declaration-package.fixture.js'
import { sinkInto } from '../extractor-harness.fixture.js'
import { layer as synchronousNodeFileSystemLayer } from './synchronous-node-file-system.fixture.js'

const packageRoot = fileURLToPath(new URL('../../../', import.meta.url))
const fixturesRoot = fileURLToPath(new URL('./', import.meta.url))
const packageNodeModules = nodePath.join(packageRoot, 'node_modules')

export interface EmittedFile {
  readonly path: string
  readonly contents: string
}

export interface ConsoleSide {
  readonly stdout: string
  readonly stderr: string
}

export type FailureClass = 'none' | 'config' | 'compiler' | 'analysis' | 'platform'

export interface SideArtifacts {
  readonly failure: FailureClass
  readonly succeeded: boolean
  readonly emitted: ReadonlyArray<EmittedFile>
  readonly console: ConsoleSide
}

export interface GoldenVerdict {
  readonly fixture: string
  readonly directory: string
  readonly matches: boolean
  readonly differences: ReadonlyArray<string>
}

export interface EngineArtifacts extends SideArtifacts {
  readonly golden: GoldenVerdict | undefined
}

interface CorpusSpec {
  readonly name: string
  readonly root: string
  readonly configPath: string
}

export interface CorpusFixture extends ParityPackage {
  readonly root: string
}

const corpusSpecs: ReadonlyArray<CorpusSpec> = [
  { name: 'report-parity/simple-pkg', root: 'report-parity/simple-pkg', configPath: 'api-extractor.json' },
  { name: 'config-lookup/config-lookup1', root: 'config-lookup', configPath: 'config-lookup1/api-extractor.json' },
  {
    name: 'config-lookup/config-lookup2',
    root: 'config-lookup',
    configPath: 'config-lookup2/config/api-extractor.json',
  },
  { name: 'analyzer', root: 'analyzer', configPath: 'api-extractor.json' },
  { name: 'node-ambient', root: 'node-ambient', configPath: 'api-extractor.json' },
  { name: 'global-reference', root: 'global-reference', configPath: 'api-extractor.json' },
  { name: 'ambient-alias', root: 'ambient-alias', configPath: 'api-extractor.json' },
  { name: 'value-import-type', root: 'value-import-type', configPath: 'api-extractor.json' },
  { name: 'external-api', root: 'external-api', configPath: 'api-extractor.json' },
  { name: 'external-star', root: 'external-star', configPath: 'api-extractor.json' },
  { name: 'empty-emitted', root: 'empty-emitted', configPath: 'api-extractor.json' },
  { name: 'refusal/unknown-root-key', root: 'refusal/unknown-root-key', configPath: 'api-extractor.json' },
  { name: 'refusal/unknown-section-key', root: 'refusal/unknown-section-key', configPath: 'api-extractor.json' },
  { name: 'refusal/missing-entry-point', root: 'refusal/missing-entry-point', configPath: 'api-extractor.json' },
  {
    name: 'refusal/non-dts-entry-point',
    root: 'refusal/non-dts-entry-point',
    configPath: 'api-extractor.json',
  },
]

const byPath = (left: { readonly path: string }, right: { readonly path: string }): number =>
  left.path < right.path ? -1 : left.path > right.path ? 1 : 0

const expectedDirectory = 'expected'

const collect = (directory: string, prefix: string, found: Array<ParityFile>): void => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    const absolute = nodePath.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== expectedDirectory) collect(absolute, relative, found)
    } else found.push({ path: relative, contents: fs.readFileSync(absolute, 'utf8') })
  }
}

export const parityCorpus: ReadonlyArray<CorpusFixture> = corpusSpecs.map((spec) => {
  const found: Array<ParityFile> = []
  collect(nodePath.join(fixturesRoot, spec.root), '', found)
  return { name: spec.name, root: spec.root, configPath: spec.configPath, files: found.sort(byPath) }
})

const fixtureText = (relativePath: string): string => fs.readFileSync(nodePath.join(fixturesRoot, relativePath), 'utf8')

const bareExtendsConfig = `{
  "$schema": "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
  "extends": "shared-config/api-extractor-base.json",
  "mainEntryPointFilePath": "<projectFolder>/index.d.ts",
  "bundledPackages": ["derived-pkg-override"],
  "apiReport": {
    "enabled": true,
    "reportFileName": "bare-extends.api.md"
  }
}
`

export const bareExtendsPackage: ParityPackage = {
  name: 'config-lookup/bare-extends',
  configPath: 'api-extractor.json',
  files: [
    { path: 'api-extractor.json', contents: bareExtendsConfig },
    { path: 'index.d.ts', contents: fixtureText('config-lookup/config-lookup1/index.d.ts') },
    { path: 'package.json', contents: fixtureText('config-lookup/config-lookup1/package.json') },
    { path: 'tsconfig.json', contents: fixtureText('config-lookup/config-lookup1/tsconfig.json') },
    { path: 'etc/.gitkeep', contents: '' },
    {
      path: 'node_modules/shared-config/api-extractor-base.json',
      contents: fixtureText('config-lookup/base-config/api-extractor-base.json'),
    },
  ],
}

const bundledConfig = `{
  "$schema": "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
  "mainEntryPointFilePath": "<projectFolder>/lib/index.d.ts",
  "compiler": {
    "tsconfigFilePath": "<projectFolder>/tsconfig.json"
  },
  "bundledPackages": ["other-pkg"],
  "apiReport": {
    "enabled": false
  },
  "docModel": {
    "enabled": false
  },
  "dtsRollup": {
    "enabled": true,
    "untrimmedFilePath": "<projectFolder>/dist/bundled.d.ts"
  },
  "newlineKind": "lf",
  "messages": {
    "extractorMessageReporting": {
      "default": { "logLevel": "none" }
    },
    "tsdocMessageReporting": {
      "default": { "logLevel": "none" }
    }
  }
}
`

const bundledManifest = `{
  "private": true,
  "name": "bundled-fixture",
  "version": "1.0.0",
  "types": "lib/index.d.ts"
}
`

const bundledTsconfig = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "skipLibCheck": true
  },
  "files": ["lib/index.d.ts"]
}
`

const otherPackageManifest = `{
  "name": "other-pkg",
  "version": "1.0.0",
  "types": "lib/index.d.ts",
  "exports": {
    ".": {
      "types": "./lib/index.d.ts"
    }
  }
}
`

const otherPackageDeclaration = `/**
 * @public
 */
export interface Widget {
  readonly id: string
}
`

const bundledEntry = `import type { Widget } from 'other-pkg'

/**
 * @public
 */
export declare function makeWidget(): Widget

/**
 * @public
 */
export declare function describeWidget(widget: Widget): string

export { Widget } from 'other-pkg'
`

export const bundledPackagesPackage: ParityPackage = {
  name: 'rollup/bundled-packages',
  configPath: 'api-extractor.json',
  files: [
    { path: 'api-extractor.json', contents: bundledConfig },
    { path: 'package.json', contents: bundledManifest },
    { path: 'tsconfig.json', contents: bundledTsconfig },
    { path: 'lib/index.d.ts', contents: bundledEntry },
    { path: 'node_modules/other-pkg/package.json', contents: otherPackageManifest },
    { path: 'node_modules/other-pkg/lib/index.d.ts', contents: otherPackageDeclaration },
  ],
}

const writePackage = (root: string, files: ReadonlyArray<ParityFile>): void => {
  for (const file of files) {
    const target = nodePath.join(root, file.path)
    fs.mkdirSync(nodePath.dirname(target), { recursive: true })
    fs.writeFileSync(target, file.contents)
  }
}

const observedTree = (root: string): Readonly<Record<string, string>> => {
  const found: Array<readonly [string, string]> = []
  const descend = (directory: string, prefix: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      const absolute = nodePath.join(directory, entry.name)
      if (entry.isDirectory()) descend(absolute, relative)
      else found.push([relative, fs.readFileSync(absolute, 'utf8')])
    }
  }
  descend(root, '')
  return Object.fromEntries(found)
}

const emittedBetween = (
  input: ReadonlyArray<ParityFile>,
  observed: Readonly<Record<string, string>>,
): ReadonlyArray<EmittedFile> => {
  const given = new Map(input.map((file) => [file.path, file.contents]))
  return Object.entries(observed)
    .filter(([path, contents]) => given.get(path) !== contents)
    .map(([path, contents]) => ({ path, contents }))
    .sort(byPath)
}

const scratchOf = (prefix: string): string => {
  const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), prefix))
  fs.symlinkSync(packageNodeModules, nodePath.join(root, 'node_modules'), 'dir')
  return root
}

const prepareUpstream = (configPath: string): Option.Option<ExtractorConfig> => {
  try {
    return Option.some(ExtractorConfig.loadFileAndPrepare(configPath))
  } catch {
    return Option.none()
  }
}

const isConfigFailure = (error: unknown): boolean =>
  Schema.is(Extractor.ConfigFileNotFound)(error) ||
  Schema.is(Extractor.ConfigJsonSyntaxError)(error) ||
  Schema.is(Extractor.ConfigSchemaValidationError)(error) ||
  Schema.is(Extractor.UnresolvedTokenError)(error) ||
  Schema.is(Extractor.CircularConfigExtendsError)(error) ||
  Schema.is(Extractor.ConfigExtendsResolutionError)(error) ||
  Schema.is(Extractor.UnsupportedFeatureError)(error) ||
  Schema.is(Extractor.MainEntryPointNotDeclarationError)(error)

const isCompilerFailure = (error: unknown): boolean =>
  Schema.is(Extractor.TsConfigReadError)(error) ||
  Schema.is(Extractor.TsCompilerLoadError)(error) ||
  Schema.is(Extractor.MissingMainEntryPointError)(error)

const isAnalysisFailure = (error: unknown): boolean =>
  Schema.is(Extractor.UnsupportedSyntaxError)(error) ||
  Schema.is(Extractor.UnsupportedStarExportError)(error)

const failureClassOf = (error: Extractor.ExtractorError | PlatformError): FailureClass =>
  Match.value(error).pipe(
    Match.when(isConfigFailure, (): FailureClass => 'config'),
    Match.when(isCompilerFailure, (): FailureClass => 'compiler'),
    Match.when(isAnalysisFailure, (): FailureClass => 'analysis'),
    Match.orElse((): FailureClass => 'platform'),
  )

const outcomeClassOf = (succeeded: boolean): FailureClass => succeeded ? 'none' : 'analysis'

const emptyConsole: ConsoleSide = { stdout: '', stderr: '' }

const consoleText = (lines: ReadonlyArray<string>): string => lines.map((line) => `${line}\n`).join('')

const withoutRoot = (root: string, text: string): string => text.split(root).join('<root>')

const consoleSideOf = (root: string, stdout: string, stderr: string): ConsoleSide => ({
  stdout: withoutRoot(root, stdout),
  stderr: withoutRoot(root, stderr),
})

const consoleRecorder = (lines: Array<string>) =>
(...args: ReadonlyArray<unknown>): void => {
  lines.push(args.map((arg) => String(arg)).join(' '))
}

const withCapturedConsole = <A>(root: string, use: () => A): { readonly value: A; readonly console: ConsoleSide } => {
  const stdout: Array<string> = []
  const stderr: Array<string> = []
  const originalLog = console.log
  const originalWarn = console.warn
  const originalError = console.error
  console.log = consoleRecorder(stdout)
  console.warn = consoleRecorder(stderr)
  console.error = consoleRecorder(stderr)
  try {
    return {
      value: use(),
      console: consoleSideOf(root, consoleText(stdout), consoleText(stderr)),
    }
  } finally {
    console.log = originalLog
    console.warn = originalWarn
    console.error = originalError
  }
}

export const upstreamArtifacts = (input: ParityPackage): Effect.Effect<SideArtifacts> =>
  Effect.sync(() => {
    const root = scratchOf('.parity-upstream-')
    try {
      writePackage(root, input.files)
      return Option.match(prepareUpstream(nodePath.join(root, input.configPath)), {
        onNone: (): SideArtifacts => ({ failure: 'config', succeeded: false, emitted: [], console: emptyConsole }),
        onSome: (config): SideArtifacts => {
          const invoked = withCapturedConsole(root, () => UpstreamExtractor.invoke(config, { localBuild: true }))
          return {
            failure: outcomeClassOf(invoked.value.succeeded),
            succeeded: invoked.value.succeeded,
            emitted: emittedBetween(input.files, observedTree(root)),
            console: invoked.console,
          }
        },
      })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

const fileEntry = (
  path: Path.Path,
  root: string,
  entry: string,
): Effect.Effect<Option.Option<readonly [string, string]>, PlatformError, FileSystem.FileSystem> =>
  Effect.flatMap(FileSystem.FileSystem, (files) => {
    const absolute = path.join(root, entry)
    return Effect.flatMap(files.stat(absolute), (info) =>
      info.type === 'File'
        ? Effect.map(
          files.readFileString(absolute),
          (text): Option.Option<readonly [string, string]> => Option.some([entry, text]),
        )
        : Effect.succeed(Option.none<readonly [string, string]>()),
    )
  })

const readThrough = (
  path: Path.Path,
  root: string,
): Effect.Effect<Readonly<Record<string, string>>, PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const files = yield* FileSystem.FileSystem
    const entries = yield* files.readDirectory(root, { recursive: true })
    const found = yield* Effect.forEach(entries, (entry) => fileEntry(path, root, entry))
    return Object.fromEntries(
      found.flatMap((entry): ReadonlyArray<readonly [string, string]> =>
        Option.match(entry, { onNone: () => [], onSome: (pair) => [pair] }),
      ),
    )
  })

export const engineArtifacts = (input: ParityPackage): Effect.Effect<EngineArtifacts, PlatformError> =>
  Effect.suspend(() => {
    const root = scratchOf('.parity-engine-')
    writePackage(root, input.files)
    const stdout: Array<string> = []
    const stderr: Array<string> = []
    const services = Layer.mergeAll(
      synchronousNodeFileSystemLayer,
      nodePathLayer,
      Extractor.layer({ stdout: sinkInto(stdout), stderr: sinkInto(stderr) }),
    )
    const withGolden = (artifacts: SideArtifacts): EngineArtifacts => ({
      ...artifacts,
      golden: Option.getOrUndefined(goldenVerdictOf(input.name, artifacts.emitted)),
    })
    const engineConsole = (): ConsoleSide => consoleSideOf(root, stdout.join(''), stderr.join(''))
    const program = Effect.gen(function*() {
      const path = yield* Path.Path
      const outcome = yield* Extractor.run({
        configFilePath: path.join(root, input.configPath),
        options: { localBuild: true },
      }).pipe(Effect.result)
      const observed = yield* readThrough(path, root)
      return withGolden(Result.match(outcome, {
        onFailure: (error): SideArtifacts => ({
          failure: failureClassOf(error),
          succeeded: false,
          emitted: [],
          console: engineConsole(),
        }),
        onSuccess: (decision): SideArtifacts => ({
          failure: outcomeClassOf(Schema.is(Extractor.ExtractionPassed)(decision)),
          succeeded: Schema.is(Extractor.ExtractionPassed)(decision),
          emitted: emittedBetween(input.files, observed),
          console: engineConsole(),
        }),
      }))
    })
    return program.pipe(
      Effect.provide(services),
      Effect.ensuring(
        Effect.sync(() => {
          fs.rmSync(root, { recursive: true, force: true })
        }),
      ),
    )
  })

export const normalizeTsdocMetadata = (file: EmittedFile): string =>
  file.path.endsWith('tsdoc-metadata.json')
    ? file.contents
      .replace(/("packageName":\s*)"[^"]*"/, '$1"<tool>"')
      .replace(/("packageVersion":\s*)"[^"]*"/, '$1"<version>"')
    : file.contents

export const normalizeEmitted = (files: ReadonlyArray<EmittedFile>): ReadonlyArray<EmittedFile> =>
  files
    .map((file): EmittedFile => ({ path: file.path, contents: normalizeTsdocMetadata(file) }))
    .sort(byPath)

export interface GoldenFixture {
  readonly name: string
  readonly pkg: ParityPackage
}

/**
 * Every non-generated comparison: the corpus specs plus the two packages the corpus cannot
 * carry on disk because their config or manifest is built in this fixture.
 */
export const goldenFixtures: ReadonlyArray<GoldenFixture> = [
  ...parityCorpus.map((fixture): GoldenFixture => ({ name: fixture.name, pkg: fixture })),
  { name: bareExtendsPackage.name, pkg: bareExtendsPackage },
  { name: bundledPackagesPackage.name, pkg: bundledPackagesPackage },
]

const goldenSentinel = '.gitkeep'

const goldenDirectoryOf = (fixture: string): string => nodePath.join(fixturesRoot, fixture, expectedDirectory)

const goldenFilesIn = (fixture: string): ReadonlyArray<EmittedFile> => {
  const found: Array<EmittedFile> = []
  const descend = (directory: string, prefix: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === goldenSentinel) continue
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      const absolute = nodePath.join(directory, entry.name)
      if (entry.isDirectory()) descend(absolute, relative)
      else found.push({ path: relative, contents: fs.readFileSync(absolute, 'utf8') })
    }
  }
  descend(goldenDirectoryOf(fixture), '')
  return found.sort(byPath)
}

const goldenFixtureNamed = (fixture: string): Option.Option<GoldenFixture> =>
  Option.fromNullishOr(goldenFixtures.find((candidate) => candidate.name === fixture))

const goldenDifferences = (
  golden: ReadonlyArray<EmittedFile>,
  emitted: ReadonlyArray<EmittedFile>,
): ReadonlyArray<string> => {
  const expected = new Map(normalizeEmitted(golden).map((file) => [file.path, file.contents]))
  const actual = new Map(normalizeEmitted(emitted).map((file) => [file.path, file.contents]))
  const missing = [...expected.keys()].filter((path) => !actual.has(path)).map((path) => `missing: ${path}`)
  const extra = [...actual.keys()].filter((path) => !expected.has(path)).map((path) => `extra: ${path}`)
  const differing = [...expected.keys()]
    .filter((path) => actual.has(path) && actual.get(path) !== expected.get(path))
    .map((path) => `differs: ${path}`)
  return [...missing, ...extra, ...differing].sort()
}

export const goldenVerdictOf = (fixture: string, emitted: ReadonlyArray<EmittedFile>): Option.Option<GoldenVerdict> =>
  Option.map(goldenFixtureNamed(fixture), (known) => {
    const directory = goldenDirectoryOf(known.name)
    const differences = fs.existsSync(directory)
      ? goldenDifferences(goldenFilesIn(known.name), emitted)
      : [`missing: the whole golden directory ${directory}`]
    return { fixture: known.name, directory, matches: differences.length === 0, differences }
  })

export const mintRequested = process.env['PARITY_MINT_GOLDENS'] === '1'

export const mintGolden = (fixture: GoldenFixture): Effect.Effect<ReadonlyArray<EmittedFile>> =>
  Effect.map(upstreamArtifacts(fixture.pkg), (artifacts) => {
    const directory = goldenDirectoryOf(fixture.name)
    fs.rmSync(directory, { recursive: true, force: true })
    fs.mkdirSync(directory, { recursive: true })
    if (artifacts.emitted.length === 0) fs.writeFileSync(nodePath.join(directory, goldenSentinel), '')
    else writePackage(directory, artifacts.emitted)
    return goldenFilesIn(fixture.name)
  })