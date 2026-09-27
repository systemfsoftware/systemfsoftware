import { Effect, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import { allOf, anyOf, branch } from './branch.js'
import { checkProgram } from './compiler-session.js'
import type { EnrollmentFindings } from './compiler-session.js'
import { PackageManifest } from './package-manifest.schema.js'
import { ProgramConfig } from './program-config.schema.js'
import { type StopEnrollmentReport, unroutedFor } from './report.js'
import { TsconfigNotFound, UnreadableSource } from './StopEnrollmentFailure.schema.js'
import { CONFORMANCE_TEST_FILENAME } from './unit-kind.js'

export interface CheckOptions {
  readonly packageRoot?: string | undefined
  readonly project?: string | undefined
}

interface RunInput {
  readonly packageRoot: string
  readonly tsconfig: string
  readonly sourceFiles: readonly string[]
  readonly testFiles: readonly string[]
  readonly packageName: string
  readonly testScript: string | undefined
}

const SOURCE_SUFFIX = /\.(?:ts|tsx|mts|cts)$/u
const DECLARATION_SUFFIX = /\.d\.(?:ts|mts|cts)$/u
const TESTISH_SUFFIX = /\.(?:test|spec)\.(?:ts|tsx|mts|cts)$/u

const PRUNED_DIRECTORIES: Record<string, true> = {
  node_modules: true,
  dist: true,
  repos: true,
  '.git': true,
  temp: true,
}

const TEST_DIRECTORIES: Record<string, true> = {
  __tests__: true,
  __fixtures__: true,
  test: true,
  tests: true,
}

const CONFIG_CANDIDATES: readonly string[] = ['tsconfig.test.json', 'tsconfig.json']

const EMPTY_REPORT: StopEnrollmentReport = {
  enrolled: 0,
  linked: 0,
  direct: 0,
  transitive: 0,
  unlinked: [],
  unrouted: [],
}

const messageOf = (cause: { readonly message: string }): string => cause.message

const isSourceFile = (path: string): boolean => SOURCE_SUFFIX.test(path) && !DECLARATION_SUFFIX.test(path)

const underTest = (path: string): boolean =>
  anyOf([
    TESTISH_SUFFIX.test(path),
    path.replaceAll('\\', '/').split('/').some((segment) => TEST_DIRECTORIES[segment] === true),
  ])

const sorted = (paths: readonly string[]): readonly string[] => [...paths].sort()

const isDirectory = (info: Option.Option<FileSystem.File.Info>): boolean =>
  Option.match(info, { onNone: () => false, onSome: (found) => found.type === 'Directory' })

const statOf = (
  fs: FileSystem.FileSystem,
  path: string,
): Effect.Effect<Option.Option<FileSystem.File.Info>> =>
  Effect.match(fs.stat(path), {
    onFailure: () => Option.none(),
    onSuccess: (info) => Option.some(info),
  })

const readNamesOf = (fs: FileSystem.FileSystem, path: string): Effect.Effect<readonly string[], UnreadableSource> =>
  fs.readDirectory(path).pipe(Effect.mapError((cause) => UnreadableSource.make({ path, message: messageOf(cause) })))

const kept = (file: string, keep: (file: string) => boolean): Effect.Effect<readonly string[]> =>
  branch({
    on: keep(file),
    yes: () => Effect.succeed<readonly string[]>([file]),
    no: () => Effect.succeed<readonly string[]>([]),
  })

const walk = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
  keep: (file: string) => boolean,
): Effect.Effect<readonly string[], UnreadableSource> =>
  Effect.gen(function*() {
    const names = sorted(yield* readNamesOf(fs, dir))
    const nested = yield* Effect.forEach(names, (name) => walkEntry(fs, path, dir, name, keep), { concurrency: 1 })
    return nested.flat()
  })

const walkEntry = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
  name: string,
  keep: (file: string) => boolean,
): Effect.Effect<readonly string[], UnreadableSource> =>
  Effect.gen(function*() {
    const full = path.join(dir, name)
    const info = yield* statOf(fs, full)
    return yield* branch({
      on: isDirectory(info),
      yes: () =>
        branch({
          on: PRUNED_DIRECTORIES[name] === true,
          yes: () => Effect.succeed<readonly string[]>([]),
          no: () => walk(fs, path, full, keep),
        }),
      no: () => kept(full, keep),
    })
  })

const sourceModules = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  packageRoot: string,
): Effect.Effect<readonly string[], UnreadableSource> =>
  Effect.gen(function*() {
    const src = path.join(packageRoot, 'src')
    const info = yield* statOf(fs, src)
    return yield* Option.match(info, {
      onNone: () => Effect.succeed<readonly string[]>([]),
      onSome: (found) =>
        branch({
          on: found.type === 'Directory',
          yes: () =>
            Effect.map(walk(fs, path, src, isSourceFile), (files) => sorted(files.filter((file) => !underTest(file)))),
          no: () => Effect.fail(UnreadableSource.make({ path: src, message: 'src is not a directory' })),
        }),
    })
  })

const conformanceTests = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  packageRoot: string,
): Effect.Effect<readonly string[], UnreadableSource> =>
  Effect.gen(function*() {
    const info = yield* statOf(fs, packageRoot)
    return yield* Option.match(info, {
      onNone: () => Effect.succeed<readonly string[]>([]),
      onSome: (found) =>
        branch({
          on: found.type === 'Directory',
          yes: () => Effect.map(walk(fs, path, packageRoot, (file) => CONFORMANCE_TEST_FILENAME.test(file)), sorted),
          no: () => Effect.succeed<readonly string[]>([]),
        }),
    })
  })

const firstExisting = (
  fs: FileSystem.FileSystem,
  candidates: readonly string[],
  packageRoot: string,
): Effect.Effect<string, TsconfigNotFound> =>
  Effect.gen(function*() {
    const checked = yield* Effect.forEach(
      candidates,
      (candidate) => Effect.map(statOf(fs, candidate), (info) => ({ candidate, exists: Option.isSome(info) })),
      { concurrency: 1 },
    )
    return yield* Option.match(Option.fromUndefinedOr(checked.filter((entry) => entry.exists)[0]), {
      onNone: () => Effect.fail(TsconfigNotFound.make({ packageRoot, searched: candidates })),
      onSome: (entry) => Effect.succeed(entry.candidate),
    })
  })

const resolveConfigPath = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  packageRoot: string,
  project: string | undefined,
): Effect.Effect<string, TsconfigNotFound> =>
  branch({
    on: project === undefined,
    yes: () => firstExisting(fs, CONFIG_CANDIDATES.map((name) => path.join(packageRoot, name)), packageRoot),
    no: () => firstExisting(fs, [path.resolve(project ?? '')], packageRoot),
  })

const readManifest = (fs: FileSystem.FileSystem, path: string): Effect.Effect<PackageManifest, UnreadableSource> =>
  fs.readFileString(path).pipe(
    Effect.flatMap((text) => Schema.decodeEffect(Schema.fromJsonString(PackageManifest))(text)),
    Effect.mapError((cause) => UnreadableSource.make({ path, message: messageOf(cause) })),
  )

const nameOf = (manifest: PackageManifest, packageRoot: string): string =>
  Option.getOrElse(Option.fromUndefinedOr(manifest.name), () => packageRoot)

const writeProgramConfig = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  tsconfig: string,
  files: readonly string[],
): Effect.Effect<{ readonly directory: string; readonly configPath: string }, UnreadableSource> =>
  Effect.gen(function*() {
    const directory = yield* fs.makeTempDirectory({ prefix: 'stop-enrollment-' }).pipe(
      Effect.mapError((cause) => UnreadableSource.make({ path: tsconfig, message: messageOf(cause) })),
    )
    const configPath = path.join(directory, 'tsconfig.json')
    const contents = yield* Schema.encodeEffect(Schema.fromJsonString(ProgramConfig))({
      extends: tsconfig,
      files: sorted(files),
      include: [],
      references: [],
    }).pipe(Effect.mapError((cause) => UnreadableSource.make({ path: configPath, message: messageOf(cause) })))
    yield* fs.writeFileString(configPath, contents).pipe(
      Effect.mapError((cause) => UnreadableSource.make({ path: configPath, message: messageOf(cause) })),
    )
    return { directory, configPath }
  })

const reportOf = (findings: EnrollmentFindings, input: RunInput): StopEnrollmentReport => ({
  ...findings,
  unrouted: unroutedFor({
    packageName: input.packageName,
    testScript: input.testScript,
    linked: findings.linked,
  }),
})

const runProgram = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  input: RunInput,
): Effect.Effect<StopEnrollmentReport, UnreadableSource> =>
  Effect.gen(function*() {
    const written = yield* writeProgramConfig(fs, path, input.tsconfig, [...input.sourceFiles, ...input.testFiles])
    const findings = yield* checkProgram({
      packageRoot: input.packageRoot,
      configPath: written.configPath,
      sourceFiles: input.sourceFiles,
      testFiles: input.testFiles,
    }).pipe(Effect.ensuring(fs.remove(written.directory, { recursive: true, force: true }).pipe(Effect.ignore)))
    return yield* Option.match(findings, {
      onNone: () =>
        Effect.fail(
          UnreadableSource.make({
            path: written.configPath,
            message: 'the compiler produced no project over the package sources',
          }),
        ),
      onSome: (found) => Effect.succeed(reportOf(found, input)),
    })
  })

export const checkStopEnrollment = (
  options: CheckOptions,
): Effect.Effect<StopEnrollmentReport, UnreadableSource | TsconfigNotFound, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const packageRoot = path.resolve(Option.getOrElse(Option.fromUndefinedOr(options.packageRoot), () => '.'))
    const tsconfig = yield* resolveConfigPath(fs, path, packageRoot, options.project)
    const manifest = yield* readManifest(fs, path.join(packageRoot, 'package.json'))
    const sourceFiles = yield* sourceModules(fs, path, packageRoot)
    const testFiles = yield* conformanceTests(fs, path, packageRoot)
    const input: RunInput = {
      packageRoot,
      tsconfig,
      sourceFiles,
      testFiles,
      packageName: nameOf(manifest, packageRoot),
      testScript: manifest.scripts?.test,
    }
    return yield* branch({
      on: allOf([sourceFiles.length === 0, testFiles.length === 0]),
      yes: () => Effect.succeed(EMPTY_REPORT),
      no: () => runProgram(fs, path, input),
    })
  })
