import { Effect, Result, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import { allOf, anyOf, branch } from '../branch.js'
import { notAPackage, SystemfError, tsconfigNotFound, unknown, unknownRule } from '../contract/errors.js'
import type { CheckData, CheckedPackage, Finding, Reach } from '../contract/result.js'
import { RuleId } from '../contract/result.js'
import type { Enrollment } from '../unit/enroll.js'
import { checkProgram } from '../unit/enroll.js'
import { PackageManifest } from '../unit/package-manifest.schema.js'
import { ProgramConfig } from '../unit/program-config.schema.js'
import { unlinkedFinding, unreadableFinding, unroutedFinding } from './findings.js'
import { runsConformanceProject } from './report.js'
import { UnreadableSource } from './sources.schema.js'

/** What one invocation asks the check to do. */
export interface CheckRequest {
  readonly cwd: string
  readonly packages: readonly string[]
  readonly project?: string | undefined
  readonly only?: readonly string[] | undefined
}

/** One package's run: what enrolled, and the findings that are not about a unit. */
export interface PackageRun {
  readonly packageName: string
  readonly root: string
  readonly enrollment: Enrollment
  readonly testScript: string | undefined
  readonly findings: readonly Finding[]
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

const emptyEnrollment: Enrollment = {
  units: [],
  reaches: new Map<string, readonly Reach[]>(),
  enrolled: 0,
  linked: 0,
  direct: 0,
  transitive: 0,
  unlinked: [],
}

const messageOf = (cause: { readonly message: string }): string => cause.message

const relativeTo = (root: string, file: string): string => {
  const normalizedRoot = root.replaceAll('\\', '/').replace(/\/$/u, '')
  const normalizedFile = file.replaceAll('\\', '/')
  return branch({
    on: normalizedFile.startsWith(`${normalizedRoot}/`),
    yes: () => normalizedFile.slice(normalizedRoot.length + 1),
    no: () => normalizedFile,
  })
}

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
          yes: () => Effect.map(walk(fs, path, packageRoot, (file) => file.endsWith('.conformance.test.ts')), sorted),
          no: () => Effect.succeed<readonly string[]>([]),
        }),
    })
  })

const firstExisting = (
  fs: FileSystem.FileSystem,
  candidates: readonly string[],
  packageRoot: string,
): Effect.Effect<string, SystemfError> =>
  Effect.gen(function*() {
    const checked = yield* Effect.forEach(
      candidates,
      (candidate) => Effect.map(statOf(fs, candidate), (info) => ({ candidate, exists: Option.isSome(info) })),
      { concurrency: 1 },
    )
    return yield* Option.match(Option.fromUndefinedOr(checked.filter((entry) => entry.exists)[0]), {
      onNone: () => Effect.fail(tsconfigNotFound(packageRoot, candidates)),
      onSome: (entry) => Effect.succeed(entry.candidate),
    })
  })

const resolveConfigPath = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  packageRoot: string,
  project: string | undefined,
): Effect.Effect<string, SystemfError> =>
  branch({
    on: project === undefined,
    yes: () => firstExisting(fs, CONFIG_CANDIDATES.map((name) => path.join(packageRoot, name)), packageRoot),
    no: () => firstExisting(fs, [path.resolve(project ?? '')], packageRoot),
  })

const readManifest = (fs: FileSystem.FileSystem, path: string): Effect.Effect<PackageManifest, SystemfError> =>
  fs.readFileString(path).pipe(
    Effect.flatMap((text) => Schema.decodeEffect(Schema.fromJsonString(PackageManifest))(text)),
    Effect.mapError((cause) => unknown(`${path}: ${messageOf(cause)}`)),
  )

const nameOf = (manifest: PackageManifest, packageRoot: string): string =>
  Option.getOrElse(Option.fromUndefinedOr(manifest.name), () => packageRoot)

const writeProgramConfig = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  tsconfig: string,
  files: readonly string[],
): Effect.Effect<{ readonly directory: string; readonly configPath: string }, SystemfError> =>
  Effect.gen(function*() {
    const directory = yield* fs.makeTempDirectory({ prefix: 'systemf-' }).pipe(
      Effect.mapError((cause) => unknown(`${tsconfig}: ${messageOf(cause)}`)),
    )
    const configPath = path.join(directory, 'tsconfig.json')
    const contents = yield* Schema.encodeEffect(Schema.fromJsonString(ProgramConfig))({
      extends: tsconfig,
      files: sorted(files),
      include: [],
      references: [],
    }).pipe(Effect.mapError((cause) => unknown(`${configPath}: ${messageOf(cause)}`)))
    yield* fs.writeFileString(configPath, contents).pipe(
      Effect.mapError((cause) => unknown(`${configPath}: ${messageOf(cause)}`)),
    )
    return { directory, configPath }
  })

const runProgram = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  input: {
    readonly packageRoot: string
    readonly tsconfig: string
    readonly sourceFiles: readonly string[]
    readonly testFiles: readonly string[]
  },
): Effect.Effect<Enrollment, SystemfError> =>
  Effect.gen(function*() {
    const written = yield* writeProgramConfig(fs, path, input.tsconfig, [...input.sourceFiles, ...input.testFiles])
    const found = yield* checkProgram({
      packageRoot: input.packageRoot,
      configPath: written.configPath,
      sourceFiles: input.sourceFiles,
      testFiles: input.testFiles,
    }).pipe(Effect.ensuring(fs.remove(written.directory, { recursive: true, force: true }).pipe(Effect.ignore)))
    return yield* Effect.fromOption(found, () =>
      unknown(`${written.configPath}: the compiler produced no project over the package sources`))
  })

const unreadableFindings = (
  root: string,
  failures: readonly UnreadableSource[],
): readonly Finding[] => failures.map((failure) => unreadableFinding(relativeTo(root, failure.path), failure.message))

/** What `packageRun` needs: where the caller is and which package to read. */
export interface PackageRunRequest {
  readonly cwd: string
  readonly target: string
  readonly project?: string | undefined
}

export const packageRun = (
  request: PackageRunRequest,
): Effect.Effect<PackageRun, SystemfError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const packageRoot = path.resolve(request.cwd, request.target)
    const manifestInfo = yield* statOf(fs, path.join(packageRoot, 'package.json'))
    yield* Effect.fromOption(manifestInfo, () => notAPackage(packageRoot))
    return yield* packageRunOf(fs, path, packageRoot, request.project)
  })
const testScriptOf = (manifest: PackageManifest): string | undefined => manifest.scripts?.test

const unroutedFindings = (
  packageName: string,
  testScript: string | undefined,
  linked: number,
): readonly Finding[] =>
  branch({
    on: allOf([testScript !== undefined, linked > 0, !runsConformanceProject(testScript)]),
    yes: () => [unroutedFinding(packageName)],
    no: (): readonly Finding[] => [],
  })

const packageRunOf = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  packageRoot: string,
  project: string | undefined,
): Effect.Effect<PackageRun, SystemfError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const manifest = yield* readManifest(fs, path.join(packageRoot, 'package.json'))
    const tsconfig = yield* resolveConfigPath(fs, path, packageRoot, project)
    const sources = yield* Effect.result(sourceModules(fs, path, packageRoot))
    const tests = yield* Effect.result(conformanceTests(fs, path, packageRoot))
    const failures = [sources, tests].filter(Result.isFailure).map((attempt) => attempt.failure)
    const sourceFiles = Result.match(sources, { onFailure: () => [], onSuccess: (files) => files })
    const testFiles = Result.match(tests, { onFailure: () => [], onSuccess: (files) => files })
    const enrollment = yield* branch({
      on: allOf([sourceFiles.length === 0, testFiles.length === 0]),
      yes: () => Effect.succeed(emptyEnrollment),
      no: () => runProgram(fs, path, { packageRoot, tsconfig, sourceFiles, testFiles }),
    })
    const packageName = nameOf(manifest, packageRoot)
    const testScript = testScriptOf(manifest)
    return {
      packageName,
      root: packageRoot,
      enrollment,
      testScript,
      findings: [
        ...unreadableFindings(packageRoot, failures),
        ...unroutedFindings(packageName, testScript, enrollment.linked),
      ],
    }
  })

export const findingsOfRun = (run: PackageRun): readonly Finding[] =>
  [...run.enrollment.unlinked.map(unlinkedFinding), ...run.findings].sort(
    (left, right) => RuleId.literals.indexOf(left.rule) - RuleId.literals.indexOf(right.rule),
  )

const validateOnly = (only: readonly string[] | undefined): Effect.Effect<readonly string[], SystemfError> =>
  Effect.forEach(
    only === undefined ? [...RuleId.literals] : only,
    (rule) =>
      RuleId.literals.some((known) => known === rule)
        ? Effect.succeed(rule)
        : Effect.fail(unknownRule(rule, RuleId.literals)),
    { concurrency: 1 },
  )

/** The `systemf check` operation: every enrolled unit must be reached by a stop check. */
export const check = (
  request: CheckRequest,
): Effect.Effect<CheckData, SystemfError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const selected = yield* validateOnly(request.only)
    const targets = request.packages.length === 0 ? ['.'] : request.packages
    const runs = yield* Effect.forEach(
      targets,
      (target) => packageRun({ cwd: request.cwd, target, project: request.project }),
      { concurrency: 1 },
    )
    const packages: readonly CheckedPackage[] = runs.map((run) => ({
      package: run.packageName,
      root: run.root,
      enrolled: run.enrollment.enrolled,
      linked: run.enrollment.linked,
      direct: run.enrollment.direct,
      transitive: run.enrollment.transitive,
      findings: findingsOfRun(run).filter((finding) => selected.includes(finding.rule)),
    }))
    const findings = packages.flatMap((entry) => entry.findings)
    return {
      packages,
      findings,
      summary: {
        packages: packages.length,
        units: packages.reduce((total, entry) => total + entry.enrolled, 0),
        findings: findings.length,
      },
    }
  })
