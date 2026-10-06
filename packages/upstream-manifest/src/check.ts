import { Array as Arr, Effect, HashSet, Match, Option } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { dual } from 'effect/Function'

import {
  DprintConfig,
  Family as FamilySchema,
  Json as JsonSchema,
  Manifest as ManifestSchema,
  PackageManifest,
  RepoTestProject,
  SolutionProject,
  Tsconfig as TsconfigSchema,
  VitestReport,
} from './domain.schema.js'
import type {
  Addition as AdditionValue,
  DprintConfig as DprintConfigValue,
  Exports as ExportsValue,
  Family as FamilyValue,
  FamilyResult,
  InPlace as InPlaceValue,
  Json as JsonValue,
  ListVerdict,
  Manifest as ManifestValue,
  Member,
  Ported,
  PortVerdict,
  Retired as RetiredValue,
  SolutionProject as SolutionProjectValue,
} from './domain.schema.js'
import { Git, lines, runGit } from './git.js'
import { canonical, type JsonCodec, type JsonInput, parseJson, stringifyJson } from './json.js'
import {
  differingBlobs,
  DPRINT,
  duplicateRecords,
  FAMILY_MANIFEST,
  forkPaths,
  GuardError,
  importedSupport,
  inPlaceFiles,
  judge,
  judgePort,
  MANIFEST,
  packageDir,
  PORT_BEGIN,
  PORT_END,
  recordedButTracked,
  relativePath,
  REPO_TEST_PROJECT,
  reportedFiles,
  selectTests,
  SOLUTION_PROJECT,
  stripCr,
  unclaimed,
  unreportedFiles,
  UPSTREAM_TEST_PROJECT,
  upstreamDir,
  upstreamTestProject,
} from './manifest.js'

type Shell = FileSystem.FileSystem | Git
type Tracked = HashSet.HashSet<string>
export type { FamilyResult, Member }

/** What one member's checks contributed: failures and the files the formatter must exclude. */
type MemberOutcome = { readonly failed: number; readonly unformatted: readonly string[] }

/** How a member's recorded files diverge from the working tree. */
type DriftCounts = {
  readonly untracked: readonly string[]
  readonly stillTracked: readonly string[]
  readonly altered: readonly string[]
  readonly supportAltered: readonly string[]
}

/** The member's expected tsconfig compiler options, when the family tracks upstream's tsconfig. */
type UpstreamOptions = Option.Option<Readonly<Record<string, JsonValue>>>

const dirName = (path: string): string => {
  const at = path.lastIndexOf('/')
  return at < 0 ? '' : path.slice(0, at)
}

const guard = (operation: string) => (error: { readonly message: string }): GuardError =>
  GuardError.make({ message: `${operation}: ${error.message}` })

const not = (value: boolean): boolean => !value

const everyTrue = (values: readonly boolean[]): boolean => values.every((value) => value)

const orDefault = <A>(value: A | undefined, fallback: A): A => value ?? fallback

const sortedUnique = (values: readonly string[]): readonly string[] => [...new Set(values)].toSorted()

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

const nth = (parts: readonly string[], index: number): string => parts[index] ?? ''

const firstField = (line: string): string => nth(line.split('\t'), 0)

const secondField = (line: string): string => nth(line.split('\t'), 1)

const thirdField = (meta: string): string => nth(meta.split(' '), 2)

const blobMap = (rows: readonly string[], dir: string): Record<string, string> =>
  Object.fromEntries(rows.map((row) => [secondField(row).slice(dir.length + 1), thirdField(firstField(row))]))

const orEmptyExports = (value: ExportsValue | undefined): ExportsValue => value ?? {}

const ownedBy = (roots: readonly string[]) => (path: string): boolean =>
  roots.some((root) => path.startsWith(`${root}/`))

const countOf = (counts: DriftCounts): number =>
  counts.untracked.length + counts.stillTracked.length + counts.altered.length + counts.supportAltered.length

const isDriftedVerdict = (verdict: ListVerdict): boolean =>
  Match.valueTags(verdict, { Matches: () => false, Drifted: () => true })

const drifted = (listVerdict: ListVerdict, counts: DriftCounts): boolean =>
  isDriftedVerdict(listVerdict) || countOf(counts) > 0

/** Read and decode a JSON file at `path`, naming the path in any read failure. */
export const readJson = dual<
  (path: string) => <A, I>(schema: JsonCodec<A, I>) => Effect.Effect<A, GuardError, FileSystem.FileSystem>,
  <A, I>(schema: JsonCodec<A, I>, path: string) => Effect.Effect<A, GuardError, FileSystem.FileSystem>
>(
  2,
  <A, I>(schema: JsonCodec<A, I>, path: string): Effect.Effect<A, GuardError, FileSystem.FileSystem> =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const text = yield* fs.readFileString(path).pipe(Effect.mapError(guard(`read ${path}`)))
      return yield* parseJson(schema, text)
    }),
)

/** Write `value` as 2-space-indented JSON plus a trailing newline. */
export const writeJson = dual<
  (value: JsonInput) => (path: string) => Effect.Effect<void, GuardError, FileSystem.FileSystem>,
  (path: string, value: JsonInput) => Effect.Effect<void, GuardError, FileSystem.FileSystem>
>(2, (path, value) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    yield* fs.writeFileString(path, `${stringifyJson(value)}\n`).pipe(Effect.mapError(guard(`write ${path}`)))
  }))

const packageJsonOf = (dir: string): Effect.Effect<Option.Option<PackageManifest>, never, FileSystem.FileSystem> =>
  readJson(PackageManifest, `${dir}/package.json`).pipe(Effect.option)

const compareGenerated = (
  path: string,
  expected: JsonInput,
): Effect.Effect<number, GuardError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const actual = yield* readJson(JsonSchema, path).pipe(Effect.orElseSucceed((): JsonValue => null))
    return yield* canonical(actual) === canonical(expected)
      ? Effect.succeed(0)
      : Effect.as(Effect.logError(`✗ ${path} differs from what the manifest generates`), 1)
  })

const syncGenerated = (
  path: string,
  expected: JsonInput,
  write: boolean,
): Effect.Effect<number, GuardError, FileSystem.FileSystem> =>
  Match.value(write).pipe(
    Match.when(true, () => Effect.as(writeJson(path, expected), 0)),
    Match.orElse(() => compareGenerated(path, expected)),
  )

const familyHint = (family: FamilyValue, dir: string, detail: string): string =>
  `family ${family.name} needs upstream ${family.source.ref} at ${dir}, which this clone does not have; ` +
  `fetch it with \`git fetch --no-tags --depth=1 origin ${family.source.ref}\` (${detail})`

const upstreamBlobs = (
  family: FamilyValue,
  dir: string,
): Effect.Effect<Record<string, string>, GuardError, Shell> =>
  runGit({ args: ['ls-tree', '-r', family.source.ref, '--', `${dir}/`] }).pipe(
    Effect.mapError((error) => GuardError.make({ message: familyHint(family, dir, error.message) })),
    Effect.map((listing) => blobMap(lines(listing), dir)),
  )

const exists = (fs: FileSystem.FileSystem, path: string): Effect.Effect<boolean> =>
  fs.exists(path).pipe(Effect.orElseSucceed(() => false))

const hashBlobs = (
  dir: string,
  found: readonly string[],
): Effect.Effect<Record<string, string>, GuardError, Git> =>
  runGit({ args: ['hash-object', '--stdin-paths'], stdin: `${found.map((file) => `${dir}/${file}`).join('\n')}\n` })
    .pipe(
      Effect.map((out) => Object.fromEntries(found.map((file, index) => [file, nth(lines(out), index)]))),
    )

const worktreeBlobs = (
  dir: string,
  files: readonly string[],
): Effect.Effect<Record<string, string>, GuardError, Shell> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const present = yield* Effect.forEach(
      files,
      (file) => Effect.map(exists(fs, `${dir}/${file}`), (ok) => (ok ? Option.some(file) : Option.none<string>())),
      { concurrency: 1 },
    )
    const found = Arr.getSomes(present)
    return yield* found.length === 0 ? Effect.succeed({}) : hashBlobs(dir, found)
  })

const blobMismatch = (
  pkgDir: string,
  upBlobs: Readonly<Record<string, string>>,
  entry: Ported,
): Effect.Effect<number, never, never> =>
  Effect.as(
    Effect.logError(
      `✗ ${pkgDir}/${entry.port}: upstream's ${entry.upstream} is ${
        upBlobs[entry.upstream] ?? 'absent'
      } at the family's source, the manifest records ${entry.blob}`,
    ),
    1,
  )

const verdictFailure = (pkgDir: string, entry: Ported, verdict: PortVerdict): Effect.Effect<number, never, never> =>
  Match.valueTags(verdict, {
    Faithful: () => Effect.succeed(0),
    Unmarked: () =>
      Effect.as(
        Effect.logError(
          `✗ ${pkgDir}/${entry.port}: a region of ${
            entry.regions.map((region) => region.case).join(', ')
          } lacks its "${PORT_BEGIN}<case>" ... "${PORT_END}" markers`,
        ),
        1,
      ),
    Changed: (changed) =>
      Effect.as(
        Effect.logError(
          `✗ ${pkgDir}/${entry.port}:${changed.line} differs from upstream's ${entry.upstream} outside the ported cases`,
        ),
        1,
      ),
  })

const portContent = (
  pkgDir: string,
  upBlobs: Readonly<Record<string, string>>,
  entry: Ported,
): Effect.Effect<number, GuardError, Shell> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const upstream = (yield* runGit({ args: ['cat-file', 'blob', upBlobs[entry.upstream] ?? ''] }))
      .split('\n')
      .map(stripCr)
    const port = (yield* fs.readFileString(`${pkgDir}/${entry.port}`).pipe(
      Effect.mapError(guard(`read ${pkgDir}/${entry.port}`)),
    ))
      .split('\n')
      .map(stripCr)
    return yield* verdictFailure(pkgDir, entry, judgePort(upstream, port, entry.regions))
  })

const portFailures = (
  pkgDir: string,
  upBlobs: Readonly<Record<string, string>>,
  entry: Ported,
): Effect.Effect<number, GuardError, Shell> =>
  Match.value(upBlobs[entry.upstream] === entry.blob).pipe(
    Match.when(false, () => blobMismatch(pkgDir, upBlobs, entry)),
    Match.orElse(() => portContent(pkgDir, upBlobs, entry)),
  )

const checkPorts = (
  pkgDir: string,
  upBlobs: Readonly<Record<string, string>>,
  ported: readonly Ported[],
): Effect.Effect<number, GuardError, Shell> =>
  Effect.forEach(ported, (entry) => portFailures(pkgDir, upBlobs, entry), { concurrency: 1 }).pipe(Effect.map(sum))

const emitLines = (files: readonly string[], prefix: string): Effect.Effect<void, never, never> =>
  Effect.forEach(files, (file) => Effect.logError(`${prefix}${file}`), { concurrency: 1 })

const checkExcludes = (
  config: DprintConfigValue,
  roots: readonly string[],
  expected: readonly string[],
): Effect.Effect<number, never, never> =>
  Match.valueTags(judge(sortedUnique(config.excludes.filter(ownedBy(roots))), expected), {
    Matches: () =>
      Effect.as(
        Effect.log(`✓ ${DPRINT} excludes exactly the ${expected.length} verbatim and ported upstream test files`),
        0,
      ),
    Drifted: (drifted) =>
      Effect.as(
        Effect.andThen(
          Effect.logError(`✗ ${DPRINT} excludes under the upstream families differ from their manifests`),
          Effect.andThen(
            emitLines(drifted.extra, '    excluded but not listed: '),
            emitLines(drifted.missing, '    listed but not excluded: '),
          ),
        ),
        1,
      ),
  })

const writeExcludes = (
  config: DprintConfigValue,
  roots: readonly string[],
  expected: readonly string[],
): Effect.Effect<number, GuardError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const merged = { ...config, excludes: [...config.excludes.filter((path) => !ownedBy(roots)(path)), ...expected] }
    yield* writeJson(DPRINT, merged)
    return 0
  })

const syncFormatterExcludes = (
  roots: readonly string[],
  unformatted: readonly string[],
  write: boolean,
): Effect.Effect<number, GuardError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const config = yield* readJson(DprintConfig, DPRINT)
    const expected = sortedUnique(unformatted)
    return yield* Match.value(write).pipe(
      Match.when(true, () => writeExcludes(config, roots, expected)),
      Match.orElse(() => checkExcludes(config, roots, expected)),
    )
  })

const optionsOf = (
  path: string,
): Effect.Effect<UpstreamOptions, GuardError, FileSystem.FileSystem> =>
  Effect.map(readJson(TsconfigSchema, path), (config) => Option.fromNullishOr(config.compilerOptions))

const noUpstreamTsconfig = (
  path: string,
  blob: string,
  expected: string,
): Effect.Effect<UpstreamOptions, never, never> =>
  Effect.as(
    Effect.logError(`✗ ${path} hashes to ${blob}; the family records upstream's tsconfig as ${expected}`),
    Option.none<Readonly<Record<string, JsonValue>>>(),
  )

const checkUpstreamTsconfig = (
  familyDir: string,
  typecheck: NonNullable<FamilyValue['typecheck']>,
): Effect.Effect<UpstreamOptions, GuardError, Shell> =>
  Effect.gen(function*() {
    const path = `${familyDir}/${typecheck.tsconfig}`
    const blob = (yield* runGit({ args: ['hash-object', path] })).trim()
    return yield* blob === typecheck.blob ? optionsOf(path) : noUpstreamTsconfig(path, blob, typecheck.blob)
  })

const typecheckOptions = (familyDir: string, family: FamilyValue): Effect.Effect<UpstreamOptions, GuardError, Shell> =>
  Option.match(Option.fromNullishOr(family.typecheck), {
    onNone: () => Effect.succeed(Option.none<Readonly<Record<string, JsonValue>>>()),
    onSome: (typecheck) => checkUpstreamTsconfig(familyDir, typecheck),
  })

const typecheckUnformatted = (familyDir: string, family: FamilyValue): readonly string[] =>
  Option.match(Option.fromNullishOr(family.typecheck), {
    onNone: () => [],
    onSome: (typecheck) => [`${familyDir}/${typecheck.tsconfig}`],
  })

const typecheckFailure = (family: FamilyValue, options: UpstreamOptions): number =>
  Match.value(family.typecheck).pipe(
    Match.when(undefined, () => 0),
    Match.orElse(() => (Option.isNone(options) ? 1 : 0)),
  )

const memberSpecifier = (
  pkg: FamilyValue['packages'][string],
  manifest: PackageManifest | undefined,
  key: string,
): string => orDefault(pkg.specifier, orDefault(manifest?.name, key))

const exportsOf = (manifest: Option.Option<PackageManifest>): ExportsValue =>
  orEmptyExports(Option.getOrUndefined(Option.flatMap(manifest, (inner) => Option.fromNullishOr(inner.exports))))

const memberRecord = (
  familyDir: string,
  key: string,
  pkg: FamilyValue['packages'][string],
): Effect.Effect<Member, never, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const dir = packageDir(familyDir, key)
    const manifest = yield* packageJsonOf(dir)
    return {
      key,
      dir,
      specifier: memberSpecifier(pkg, Option.getOrUndefined(manifest), key),
      exports: exportsOf(manifest),
    }
  })

const membersOf = (
  familyDir: string,
  family: FamilyValue,
): Effect.Effect<readonly Member[], never, FileSystem.FileSystem> =>
  Effect.forEach(
    Object.entries(family.packages),
    ([key, pkg]) => memberRecord(familyDir, key, pkg),
    { concurrency: 1 },
  )

const trackedFailure = (familyPath: string, member: Member): Effect.Effect<MemberOutcome, never, never> =>
  Effect.as(
    Effect.logError(`✗ ${familyPath}: package ${member.key} has no tracked ${member.dir}/${MANIFEST}`),
    { failed: 1, unformatted: [] },
  )

const absentReport = (
  familyPath: string,
  ref: string,
  missing: readonly string[],
): Effect.Effect<MemberOutcome, never, never> =>
  Effect.as(
    Effect.logError(`✗ ${familyPath}: listed tests are absent upstream at ${ref}: ${missing.join(', ')}`),
    { failed: 1, unformatted: [] },
  )

const listLines = (listVerdict: ListVerdict): Effect.Effect<void, never, never> =>
  Match.valueTags(listVerdict, {
    Matches: () => Effect.void,
    Drifted: (drifted) =>
      Effect.andThen(
        emitLines(drifted.extra, '    not an imported upstream test: '),
        emitLines(drifted.missing, '    imported upstream test with no record: '),
      ),
  })

const countLines = (counts: DriftCounts): Effect.Effect<void, never, never> =>
  Effect.andThen(
    emitLines(counts.untracked, '    listed verbatim but not in the tree: '),
    Effect.andThen(
      emitLines(counts.stillTracked, '    ported or retired but still in the tree: '),
      Effect.andThen(
        emitLines(counts.altered, '    listed verbatim but its bytes differ from upstream: '),
        emitLines(counts.supportAltered, '    imported support but its bytes differ from upstream: '),
      ),
    ),
  )

const cleanReport = (
  path: string,
  files: number,
  ported: number,
  retired: number,
): Effect.Effect<number, never, never> =>
  Effect.as(Effect.log(`✓ ${path}: ${files} verbatim, ${ported} ported, ${retired} retired`), 0)

const driftReport = (
  path: string,
  ref: string,
  dir: string,
  listVerdict: ListVerdict,
  counts: DriftCounts,
): Effect.Effect<number, never, never> =>
  Effect.as(
    Effect.andThen(
      Effect.logError(`✗ ${path} drifted from upstream at ${ref}:${dir}`),
      Effect.andThen(listLines(listVerdict), countLines(counts)),
    ),
    1,
  )

const reportDrift = (
  path: string,
  ref: string,
  dir: string,
  listVerdict: ListVerdict,
  counts: DriftCounts,
  files: number,
  ported: number,
  retired: number,
): Effect.Effect<number, never, never> =>
  Match.value(drifted(listVerdict, counts)).pipe(
    Match.when(true, () => driftReport(path, ref, dir, listVerdict, counts)),
    Match.orElse(() => cleanReport(path, files, ported, retired)),
  )

const driftCounts = (
  member: Member,
  files: readonly string[],
  support: readonly string[],
  recorded: readonly string[],
  ported: readonly Ported[],
  tracked: Tracked,
  upBlobs: Readonly<Record<string, string>>,
): Effect.Effect<DriftCounts, GuardError, Shell> =>
  Effect.gen(function*() {
    const untracked = files.filter((file) => !HashSet.has(tracked, `${member.dir}/${file}`))
    const stillTracked = recordedButTracked(recorded, ported, tracked, member.dir)
    const altered = differingBlobs(files, yield* worktreeBlobs(member.dir, files), upBlobs)
      .filter((file) => !untracked.includes(file))
    const supportAltered = differingBlobs(support, yield* worktreeBlobs(member.dir, support), upBlobs)
    return { untracked, stillTracked, altered, supportAltered }
  })

const referenceFor = (dir: string, target: string): { readonly path: string } => ({
  path: target === `${dir}/` ? './tsconfig.app.json' : `${relativePath(dir, target)}/tsconfig.app.json`,
})

const memberReferences = (members: readonly Member[], dir: string): ReadonlyArray<{ readonly path: string }> =>
  members.map((member) => `${member.dir}/`).toSorted().map((target) => referenceFor(dir, target))

const solutionRefs = (solution: SolutionProjectValue): ReadonlyArray<{ readonly path: string }> => [
  ...(solution.references ?? []).filter((ref) => ref.path !== `./${UPSTREAM_TEST_PROJECT}`),
  { path: `./${UPSTREAM_TEST_PROJECT}` },
]

const replacePaths = (paths: Readonly<Record<string, readonly string[]>>) => (addition: AdditionValue): AdditionValue =>
  addition.option === 'paths' ? { ...addition, value: paths } : addition

const appendPaths = (
  additions: readonly AdditionValue[],
  paths: Readonly<Record<string, readonly string[]>>,
): readonly AdditionValue[] => [
  ...additions,
  { option: 'paths', value: paths, reason: 'generated from the packages source exports' },
]

const generateAdditions = (
  additions: readonly AdditionValue[],
  recorded: AdditionValue | undefined,
  paths: Readonly<Record<string, readonly string[]>>,
  write: boolean,
): readonly AdditionValue[] =>
  Match.value(recorded === undefined && write).pipe(
    Match.when(true, () => appendPaths(additions, paths)),
    Match.orElse(() => additions.map(replacePaths(paths))),
  )

const pathsEqual = (recorded: JsonInput, paths: Readonly<Record<string, readonly string[]>>): boolean =>
  canonical(recorded) === canonical(paths)

const pathsDrift = (
  dir: string,
  write: boolean,
  recorded: JsonInput,
  paths: Readonly<Record<string, readonly string[]>>,
): Effect.Effect<number, never, never> =>
  Match.value(everyTrue([not(write), not(pathsEqual(recorded, paths))])).pipe(
    Match.when(true, () =>
      Effect.as(
        Effect.logError(`✗ ${dir}/${MANIFEST}: the paths addition differs from the packages' source exports`),
        1,
      )),
    Match.orElse(() => Effect.succeed(0)),
  )

const writeManifest = (
  dir: string,
  manifest: ManifestValue,
  files: readonly string[],
  generated: readonly AdditionValue[],
  write: boolean,
): Effect.Effect<void, GuardError, FileSystem.FileSystem> =>
  Match.value(write).pipe(
    Match.when(
      true,
      () =>
        writeJson(`${dir}/${MANIFEST}`, {
          ...manifest,
          files,
          typecheck: { ...manifest.typecheck, additions: generated },
        }),
    ),
    Match.orElse(() => Effect.void),
  )

const typecheckOf = (manifest: ManifestValue): ManifestValue['typecheck'] => manifest.typecheck

const additionsIn = (typecheck: ManifestValue['typecheck']): readonly AdditionValue[] | undefined =>
  typecheck?.additions

const additionsOf = (manifest: ManifestValue): readonly AdditionValue[] =>
  orDefault(additionsIn(typecheckOf(manifest)), [])

/**
 * Regenerate a member's `tsconfig.upstream-test.json`, `tsconfig.test.json` and
 * `tsconfig.json`, and — under `write` — its `upstream-tests.json`, holding each
 * generated project to exactly what the family's source exports describe.
 */
export const syncTestProjects = dual<
  (
    member: Member,
    members: readonly Member[],
    manifest: ManifestValue,
    files: readonly string[],
    projectFiles: readonly string[],
    upstreamOptions: Readonly<Record<string, JsonValue>>,
  ) => (write: boolean) => Effect.Effect<number, GuardError, FileSystem.FileSystem>,
  (
    member: Member,
    members: readonly Member[],
    manifest: ManifestValue,
    files: readonly string[],
    projectFiles: readonly string[],
    upstreamOptions: Readonly<Record<string, JsonValue>>,
    write: boolean,
  ) => Effect.Effect<number, GuardError, FileSystem.FileSystem>
>(
  7,
  (
    member,
    members,
    manifest,
    files,
    projectFiles,
    upstreamOptions,
    write,
  ): Effect.Effect<number, GuardError, FileSystem.FileSystem> =>
    Effect.gen(function*() {
      const paths = forkPaths(member.dir, members)
      const additions = additionsOf(manifest)
      const recorded = additions.find((addition) => addition.option === 'paths')
      const pathsFailure = yield* pathsDrift(member.dir, write, recorded?.value, paths)
      const generated = generateAdditions(additions, recorded, paths, write)
      const references = memberReferences(members, member.dir)
      const projectFailure = yield* syncGenerated(
        `${member.dir}/${UPSTREAM_TEST_PROJECT}`,
        { ...upstreamTestProject(upstreamOptions, generated, projectFiles), references },
        write,
      )
      const repoTest = yield* readJson(RepoTestProject, `${member.dir}/${REPO_TEST_PROJECT}`)
      const repoFailure = yield* syncGenerated(
        `${member.dir}/${REPO_TEST_PROJECT}`,
        { ...repoTest, exclude: [...projectFiles] },
        write,
      )
      const solution = yield* readJson(SolutionProject, `${member.dir}/${SOLUTION_PROJECT}`)
      const solutionFailure = yield* syncGenerated(
        `${member.dir}/${SOLUTION_PROJECT}`,
        { ...solution, references: solutionRefs(solution) },
        write,
      )
      yield* writeManifest(member.dir, manifest, files, generated, write)
      return pathsFailure + projectFailure + repoFailure + solutionFailure
    }),
)

const writeNotice = (path: string, write: boolean, count: number): Effect.Effect<void, never, never> =>
  Match.value(write).pipe(
    Match.when(true, () => Effect.log(`wrote ${path} (${count} verbatim files)`)),
    Match.orElse(() => Effect.void),
  )

const memberUnformatted = (
  member: Member,
  files: readonly string[],
  ported: readonly Ported[],
  support: readonly string[],
): readonly string[] => [
  ...files.map((file) => `${member.dir}/${file}`),
  ...ported.map((entry) => `${member.dir}/${entry.port}`),
  ...support.map((file) => `${member.dir}/${file}`),
]

const portedOf = (manifest: ManifestValue): readonly Ported[] => orDefault(manifest.ported, [])

const retiredOf = (manifest: ManifestValue): readonly RetiredValue[] => orDefault(manifest.retired, [])

const inPlaceOf = (manifest: ManifestValue): readonly InPlaceValue[] => orDefault(manifest.inPlace, [])

const recordViolationLines = (manifest: ManifestValue, selected: readonly string[]): readonly string[] => [
  ...duplicateRecords(manifest).map((file) => `    recorded under more than one kind: ${file}`),
  ...inPlaceFiles(manifest)
    .filter((file) => !selected.includes(file))
    .map((file) => `    in-place file is not an upstream test: ${file}`),
]

const recordViolationReport = (member: Member, lines: readonly string[]): Effect.Effect<number, never, never> =>
  Match.value(lines.length === 0).pipe(
    Match.when(true, () => Effect.succeed(0)),
    Match.orElse(() =>
      Effect.as(
        Effect.andThen(
          Effect.logError(
            `✗ ${member.dir}/${MANIFEST}: a file is recorded under more than one kind, or an in-place file is not an upstream test`,
          ),
          emitLines(lines, ''),
        ),
        1,
      )
    ),
  )

const inPlaceFailure = (
  member: Member,
  record: InPlaceValue,
  absent: readonly string[],
  unreported: readonly string[],
): Effect.Effect<number, never, never> =>
  Effect.as(
    Effect.andThen(
      Effect.logError(
        `✗ ${member.dir}/${MANIFEST}: ${record.report} does not show every file of ${record.subtree} at ${record.commit} collected and executed`,
      ),
      Effect.andThen(
        emitLines(absent, '    in-place file missing from the subtree: '),
        emitLines(unreported, '    in-place file not collected and executed: '),
      ),
    ),
    1,
  )

const inPlaceRecord = (
  member: Member,
  record: InPlaceValue,
  tracked: Tracked,
): Effect.Effect<number, GuardError, Shell> =>
  Effect.gen(function*() {
    const absent = record.files.filter((file) => !HashSet.has(tracked, `${record.subtree}/${file}`))
    const reported = reportedFiles(yield* readJson(VitestReport, record.report))
    const unreported = unreportedFiles(record.subtree, record.files, reported)
    return yield* Match.value(everyTrue([absent.length === 0, unreported.length === 0])).pipe(
      Match.when(true, () => Effect.succeed(0)),
      Match.orElse(() => inPlaceFailure(member, record, absent, unreported)),
    )
  })

const checkInPlace = (
  member: Member,
  records: readonly InPlaceValue[],
  tracked: Tracked,
): Effect.Effect<number, GuardError, Shell> =>
  Effect.forEach(records, (record) => inPlaceRecord(member, record, tracked), { concurrency: 1 }).pipe(Effect.map(sum))

const filesOf = (write: boolean, verbatim: readonly string[], manifest: ManifestValue): readonly string[] =>
  write ? verbatim : manifest.files

const selectedOutcome = (
  familyPath: string,
  family: FamilyValue,
  members: readonly Member[],
  options: UpstreamOptions,
  tracked: Tracked,
  write: boolean,
  member: Member,
  manifest: ManifestValue,
  upBlobs: Readonly<Record<string, string>>,
  selected: readonly string[],
): Effect.Effect<MemberOutcome, GuardError, Shell> =>
  Effect.gen(function*() {
    const ported = portedOf(manifest)
    const retired = retiredOf(manifest)
    const inPlace = inPlaceOf(manifest)
    const recorded = [
      ...ported.map((entry) => entry.upstream),
      ...retired.map((entry) => entry.upstream),
      ...inPlaceFiles(manifest),
    ]
    const verbatim = selected.filter((file) => !recorded.includes(file))
    const files = filesOf(write, verbatim, manifest)
    const support = importedSupport(Object.keys(upBlobs)).filter((file) =>
      HashSet.has(tracked, `${member.dir}/${file}`)
    )
    yield* writeNotice(`${member.dir}/${MANIFEST}`, write, verbatim.length)
    const counts = yield* driftCounts(member, files, support, recorded, ported, tracked, upBlobs)
    const driftFailure = yield* reportDrift(
      `${member.dir}/${MANIFEST}`,
      family.source.ref,
      upstreamDir(family, member.key),
      judge(files, verbatim),
      counts,
      files.length,
      ported.length,
      retired.length,
    )
    const ports = yield* checkPorts(member.dir, upBlobs, ported)
    const records = yield* recordViolationReport(member, recordViolationLines(manifest, selected))
    const inPlaceFailures = yield* checkInPlace(member, inPlace, tracked)
    const projects = yield* Option.match(options, {
      onNone: () => Effect.succeed(0),
      onSome: (compilerOptions) =>
        syncTestProjects(
          member,
          members,
          manifest,
          files,
          [...files, ...ported.map((entry) => entry.port), ...support].toSorted(),
          compilerOptions,
          write,
        ),
    })
    return {
      failed: driftFailure + ports + projects + records + inPlaceFailures,
      unformatted: memberUnformatted(member, files, ported, support),
    }
  })

const trackedMember = (
  familyPath: string,
  family: FamilyValue,
  members: readonly Member[],
  options: UpstreamOptions,
  tracked: Tracked,
  write: boolean,
  member: Member,
): Effect.Effect<MemberOutcome, GuardError, Shell> =>
  Effect.gen(function*() {
    const manifest = yield* readJson(ManifestSchema, `${member.dir}/${MANIFEST}`)
    const upBlobs = yield* upstreamBlobs(family, upstreamDir(family, member.key))
    return yield* Match.valueTags(selectTests(family.tests, Object.keys(upBlobs)), {
      Absent: (absent) => absentReport(familyPath, family.source.ref, absent.missing),
      Selected: (selection) =>
        selectedOutcome(
          familyPath,
          family,
          members,
          options,
          tracked,
          write,
          member,
          manifest,
          upBlobs,
          selection.tests,
        ),
    })
  })

const memberOutcome = (
  familyPath: string,
  family: FamilyValue,
  members: readonly Member[],
  options: UpstreamOptions,
  tracked: Tracked,
  write: boolean,
  member: Member,
): Effect.Effect<MemberOutcome, GuardError, Shell> =>
  Match.value(HashSet.has(tracked, `${member.dir}/${MANIFEST}`)).pipe(
    Match.when(false, () => trackedFailure(familyPath, member)),
    Match.orElse(() => trackedMember(familyPath, family, members, options, tracked, write, member)),
  )

const collect: (
  results: readonly FamilyResult[],
) => { readonly failed: number; readonly unformatted: readonly string[]; readonly claimed: readonly string[] } = (
  results,
) => ({
  failed: sum(results.map((result) => result.failed)),
  unformatted: results.flatMap((result) => result.unformatted),
  claimed: results.flatMap((result) => result.claimed),
})

/**
 * Grade one declared family: every member's recorded files against upstream's
 * bytes, its ports against their marked regions, and its generated projects and
 * the formatter excludes against the family's declarations.
 */
export const checkFamily = dual<
  (familyPath: string, tracked: Tracked) => (write: boolean) => Effect.Effect<FamilyResult, GuardError, Shell>,
  (familyPath: string, tracked: Tracked, write: boolean) => Effect.Effect<FamilyResult, GuardError, Shell>
>(3, (familyPath, tracked, write): Effect.Effect<FamilyResult, GuardError, Shell> =>
  Effect.gen(function*() {
    const familyDir = dirName(familyPath)
    const family = yield* readJson(FamilySchema, familyPath)
    const options = yield* typecheckOptions(familyDir, family)
    const members = yield* membersOf(familyDir, family)
    const outcomes = yield* Effect.forEach(
      members,
      (member) => memberOutcome(familyPath, family, members, options, tracked, write, member),
      { concurrency: 1 },
    )
    return {
      failed: typecheckFailure(family, options) + sum(outcomes.map((outcome) => outcome.failed)),
      unformatted: [...typecheckUnformatted(familyDir, family), ...outcomes.flatMap((outcome) => outcome.unformatted)],
      claimed: members.map((member) => `${member.dir}/${MANIFEST}`),
    }
  }))

const outsideVendor = (path: string): boolean => !path.startsWith('repos/')

const baseIs = (base: string) => (path: string): boolean => path.split('/').at(-1) === base

const discover = (tracked: Tracked, base: string): readonly string[] =>
  [...tracked].filter((path) => outsideVendor(path) && baseIs(base)(path)).toSorted()

const trackedFiles = (): Effect.Effect<Tracked, GuardError, Git> =>
  runGit({ args: ['ls-files'] }).pipe(Effect.map((out) => HashSet.fromIterable(lines(out))))

const failedFamily: FamilyResult = { failed: 1, unformatted: [], claimed: [] }

const familyResult = (
  familyPath: string,
  tracked: Tracked,
  write: boolean,
): Effect.Effect<FamilyResult, never, Shell> =>
  checkFamily(familyPath, tracked, write).pipe(
    Effect.tapError((error) => Effect.logError(`✗ ${error.message}`)),
    Effect.orElseSucceed(() => failedFamily),
  )

const orphanReport = (orphans: readonly string[]): Effect.Effect<number, never, never> =>
  Effect.as(
    Effect.andThen(
      Effect.logError(
        `✗ ${orphans.length} ${MANIFEST} file(s) belong to no ${FAMILY_MANIFEST}, so nothing checks them:`,
      ),
      Effect.forEach(orphans, (path) => Effect.logError(`    ${path}`), { concurrency: 1 }),
    ),
    1,
  )

const orphansFailure = (orphans: readonly string[]): Effect.Effect<number, never, never> =>
  Match.value(orphans.length).pipe(
    Match.when(0, () => Effect.succeed(0)),
    Match.orElse(() => orphanReport(orphans)),
  )

const successLine = (families: number, manifests: number): string =>
  `✓ ${families} upstream test famil${families === 1 ? 'y' : 'ies'}, ${manifests} manifest(s)`

const regenerate = 'Regenerate the verbatim lists with `upstream-manifest --write`.'

const finalVerdict = (failed: number, families: number, claimed: number): Effect.Effect<number, never, never> =>
  Match.value(failed).pipe(
    Match.when(0, () => Effect.as(Effect.log(successLine(families, claimed)), 0)),
    Match.orElse(() => Effect.as(Effect.logError(regenerate), 1)),
  )

/**
 * Grade every family declared in the tracked tree, and hold `dprint.json`'s
 * excludes equal to the files those families own. Returns the process exit code.
 */
export const runCheck = (write: boolean): Effect.Effect<number, never, Shell> =>
  Effect.gen(function*() {
    const tracked = yield* trackedFiles()
    const families = discover(tracked, FAMILY_MANIFEST)
    const manifests = discover(tracked, MANIFEST)
    const results = yield* Effect.forEach(
      families,
      (familyPath) => familyResult(familyPath, tracked, write),
      { concurrency: 1 },
    )
    const totals = collect(results)
    const orphans = unclaimed(manifests, totals.claimed)
    const orphanFailure = yield* orphansFailure(orphans)
    const excludes = yield* syncFormatterExcludes(families.map(dirName), totals.unformatted, write)
    return yield* finalVerdict(totals.failed + orphanFailure + excludes, families.length, totals.claimed.length)
  }).pipe(
    Effect.tapError((error) => Effect.logError(`✗ ${error.message}`)),
    Effect.orElseSucceed(() => 1),
  )
