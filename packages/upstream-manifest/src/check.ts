import { Array as Arr, Effect, HashSet, Match, Option } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { dual } from 'effect/Function'
import type { Schema } from 'effect'
import type { ChildProcessSpawner } from 'effect/process'

import {
  DprintConfig,
  Family as FamilySchema,
  Json as JsonSchema,
  Manifest as ManifestSchema,
  PackageManifest,
  ReferencedProject,
  RepoTestProject,
  Tsconfig as TsconfigSchema,
} from './domain.schema.js'
import type {
  Addition as AdditionValue,
  DprintConfig as DprintConfigValue,
  Family as FamilyValue,
  FamilyResult,
  Json as JsonValue,
  ListVerdict,
  Manifest as ManifestValue,
  Member,
  Ported,
  PortVerdict,
} from './domain.schema.js'
import { lines, runGit } from './git.js'
import { canonical, decodeJson, stringifyJson } from './json.js'
import {
  differingBlobs,
  DPRINT,
  FAMILY_MANIFEST,
  forkPaths,
  importedSupport,
  judge,
  judgePort,
  MANIFEST,
  packageDir,
  PORT_BEGIN,
  PORT_END,
  recordedButTracked,
  relativePath,
  REPO_TEST_PROJECT,
  selectTests,
  SOLUTION_PROJECT,
  stripCr,
  unclaimed,
  UPSTREAM_TEST_PROJECT,
  upstreamDir,
  upstreamTestProject,
  GuardError,
} from './manifest.js'

type Spawner = ChildProcessSpawner.ChildProcessSpawner
type Shell = FileSystem.FileSystem | Spawner
export type { Member }

type Outcome = { readonly failed: number; readonly unformatted: readonly string[] }
type FamilyOutcome = { readonly failed: number; readonly unformatted: readonly string[]; readonly claimed: readonly string[] }

const dirName = (path: string): string => {
  const at = path.lastIndexOf('/')
  return at < 0 ? '' : path.slice(0, at)
}

const guard =
  (operation: string) =>
  (error: { readonly message: string }): GuardError => new GuardError({ message: `${operation}: ${error.message}` })

const sortedUnique = (values: readonly string[]): readonly string[] =>
  [...HashSet.values(HashSet.fromIterable(values))].toSorted()

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

const readJson = <A>(schema: Schema.Schema<A>, path: string): Effect.Effect<A, GuardError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const text = yield* fs.readFileString(path).pipe(Effect.mapError(guard(`read ${path}`)))
    return yield* decodeJson(schema, text)
  })

export const writeJson = dual<
  (value: JsonValue) => (path: string) => Effect.Effect<void, GuardError, FileSystem.FileSystem>,
  (path: string, value: JsonValue) => Effect.Effect<void, GuardError, FileSystem.FileSystem>
>(2, (path, value) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    yield* fs.writeFileString(path, `${stringifyJson(value)}\n`).pipe(Effect.mapError(guard(`write ${path}`)))
  }))

const compareGenerated = (path: string, expected: JsonValue): Effect.Effect<number, GuardError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const actual = yield* readJson(JsonSchema, path).pipe(Effect.orElseSucceed(() => null))
    return yield* canonical(actual) === canonical(expected)
      ? Effect.succeed(0)
      : Effect.as(Effect.logError(`✗ ${path} differs from what the manifest generates`), 1)
  })

const syncGenerated = (
  path: string,
  expected: JsonValue,
  write: boolean,
): Effect.Effect<number, GuardError, FileSystem.FileSystem> =>
  Match.value(write).pipe(
    Match.when(true, () => Effect.as(writeJson(path, expected), 0)),
    Match.orElse(() => compareGenerated(path, expected)),
  )

const nth = (parts: readonly string[], index: number): string => parts[index] ?? ''

const dropped = (path: string | undefined, length: number): string => (path ?? '').slice(length + 1)

const third = (meta: string | undefined): string => nth((meta ?? '').split(' '), 2)

const blobMap = (rows: readonly string[], dir: string): Record<string, string> =>
  Object.fromEntries(rows.map((line) => [dropped(line.split('\t')[1], dir.length), third(line.split('\t')[0])]))

const familyHint = (family: FamilyValue, dir: string, detail: string): string =>
  `family ${family.name} needs upstream ${family.source.ref} at ${dir}, which this clone does not have; ` +
  `fetch it with \`git fetch --no-tags --depth=1 origin ${family.source.ref}\` (${detail})`

const upstreamBlobs = (family: FamilyValue, dir: string): Effect.Effect<Record<string, string>, GuardError, Shell> =>
  runGit({ args: ['ls-tree', '-r', family.source.ref, '--', `${dir}/`] }).pipe(
    Effect.mapError((error) => new GuardError({ message: familyHint(family, dir, error.message) })),
    Effect.map((listing) => blobMap(lines(listing), dir)),
  )

const exists = (fs: FileSystem.FileSystem, path: string): Effect.Effect<boolean> =>
  fs.exists(path).pipe(Effect.orElseSucceed(() => false))

const hashBlobs = (dir: string, found: readonly string[]): Effect.Effect<Record<string, string>, GuardError, Spawner> =>
  runGit({ args: ['hash-object', '--stdin-paths'], stdin: `${found.map((file) => `${dir}/${file}`).join('\n')}\n` }).pipe(
    Effect.map((out) => Object.fromEntries(found.map((file, index) => [file, nth(lines(out), index)]))),
  )

const worktreeBlobs = (dir: string, files: readonly string[]): Effect.Effect<Record<string, string>, GuardError, Shell> =>
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
  Match.tag(verdict, {
    Faithful: () => Effect.succeed(0),
    Unmarked: () =>
      Effect.as(
        Effect.logError(
          `✗ ${pkgDir}/${entry.port}: a region lacks its "${PORT_BEGIN}<case>" ... "${PORT_END}" markers`,
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

const portContent = (pkgDir: string, upBlobs: Readonly<Record<string, string>>, entry: Ported): Effect.Effect<number, GuardError, Shell> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const upstream = (yield* runGit({ args: ['cat-file', 'blob', upBlobs[entry.upstream] ?? ''] })).split('\n').map(stripCr)
    const port = (yield* fs.readFileString(`${pkgDir}/${entry.port}`).pipe(Effect.mapError(guard(`read ${pkgDir}/${entry.port}`)))).split('\n').map(stripCr)
    return yield* verdictFailure(pkgDir, entry, judgePort(upstream, port, entry.regions))
  })

const portFailures = (pkgDir: string, upBlobs: Readonly<Record<string, string>>, entry: Ported): Effect.Effect<number, GuardError, Shell> =>
  Match.value(upBlobs[entry.upstream] === entry.blob).pipe(
    Match.when(false, () => blobMismatch(pkgDir, upBlobs, entry)),
    Match.orElse(() => portContent(pkgDir, upBlobs, entry)),
  )

const checkPorts = (pkgDir: string, upBlobs: Readonly<Record<string, string>>, ported: readonly Ported[]): Effect.Effect<number, GuardError, Shell> =>
  Effect.forEach(ported, (entry) => portFailures(pkgDir, upBlobs, entry), { concurrency: 1 }).pipe(Effect.map(sum))

const ownedBy = (roots: readonly string[]) => (path: string): boolean => roots.some((root) => path.startsWith(`${root}/`))

const driftLines = (drifted: { readonly extra: readonly string[]; readonly missing: readonly string[] }): Effect.Effect<void, never, never> =>
  Effect.andThen(
    Effect.forEach(drifted.extra, (file) => Effect.logError(`    excluded but not listed: ${file}`), { concurrency: 1 }),
    Effect.forEach(drifted.missing, (file) => Effect.logError(`    listed but not excluded: ${file}`), { concurrency: 1 }),
  )

const checkExcludes = (config: DprintConfigValue, roots: readonly string[], expected: readonly string[]): Effect.Effect<number, never, never> =>
  Match.tag(judge(sortedUnique(config.excludes.filter(ownedBy(roots))), expected), {
    Matches: () =>
      Effect.as(Effect.log(`✓ ${DPRINT} excludes exactly the ${expected.length} verbatim and ported upstream test files`), 0),
    Drifted: (drifted) =>
      Effect.as(
        Effect.andThen(
          Effect.logError(`✗ ${DPRINT} excludes under the upstream families differ from their manifests`),
          driftLines(drifted),
        ),
        1,
      ),
  })

const writeExcludes = (config: DprintConfigValue, roots: readonly string[], expected: readonly string[]): Effect.Effect<number, GuardError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const merged = { ...config, excludes: [...config.excludes.filter((path) => !ownedBy(roots)(path)), ...expected] }
    yield* writeJson(DPRINT, merged)
    return 0
  })

const syncFormatterExcludes = (roots: readonly string[], unformatted: readonly string[], write: boolean): Effect.Effect<number, GuardError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const config = yield* readJson(DprintConfig, DPRINT)
    const expected = sortedUnique(unformatted)
    return yield* Match.value(write).pipe(
      Match.when(true, () => writeExcludes(config, roots, expected)),
      Match.orElse(() => checkExcludes(config, roots, expected)),
    )
  })

const optionsOf = (path: string): Effect.Effect<Option.Option<Readonly<Record<string, JsonValue>>>, GuardError, FileSystem.FileSystem> =>
  Effect.map(readJson(TsconfigSchema, path), (config) => Option.fromNullishOr(config.compilerOptions))

const noUpstreamTsconfig = (path: string, blob: string, expected: string): Effect.Effect<Option.Option<Readonly<Record<string, JsonValue>>>, never, never> =>
  Effect.as(
    Effect.logError(`✗ ${path} hashes to ${blob}; the family records upstream's tsconfig as ${expected}`),
    Option.none<Readonly<Record<string, JsonValue>>>(),
  )

const checkUpstreamTsconfig = (familyDir: string, typecheck: NonNullable<FamilyValue['typecheck']>): Effect.Effect<Option.Option<Readonly<Record<string, JsonValue>>>, GuardError, Shell> =>
  Effect.gen(function*() {
    const path = `${familyDir}/${typecheck.tsconfig}`
    const blob = (yield* runGit({ args: ['hash-object', path] })).trim()
    return yield* blob === typecheck.blob ? optionsOf(path) : noUpstreamTsconfig(path, blob, typecheck.blob)
  })

const typecheckOptions = (familyDir: string, family: FamilyValue): Effect.Effect<Option.Option<Readonly<Record<string, JsonValue>>>, GuardError, Shell> =>
  Option.match(Option.fromNullishOr(family.typecheck), {
    onNone: () => Effect.succeed(Option.none<Readonly<Record<string, JsonValue>>>()),
    onSome: (typecheck) => checkUpstreamTsconfig(familyDir, typecheck),
  })

const memberRecord = (familyDir: string, key: string, pkg: FamilyValue['packages'][string]): Effect.Effect<Member, never, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const dir = packageDir(familyDir, key)
    const manifest = yield* readJson(PackageManifest, `${dir}/package.json`).pipe(Effect.orElseSucceed(() => undefined))
    return { key, dir, specifier: pkg.specifier ?? manifest?.name ?? key, exports: manifest?.exports ?? {} }
  })

const membersOf = (familyDir: string, family: FamilyValue): Effect.Effect<readonly Member[], never, FileSystem.FileSystem> =>
  Effect.forEach(Object.entries(family.packages), ([key, pkg]) => memberRecord(familyDir, key, pkg), { concurrency: 1 })

const absentSelection = (familyPath: string, selection: { readonly missing: readonly string[] }, ref: string): Effect.Effect<number, never, never> =>
  Effect.as(
    Effect.logError(`✗ ${familyPath}: listed tests are absent upstream at ${ref}: ${selection.missing.join(', ')}`),
    1,
  )

const trackedFailure = (familyPath: string, member: Member, path: string): Effect.Effect<number, never, never> =>
  Effect.as(Effect.logError(`✗ ${familyPath}: package ${member.key} has no tracked ${path}`), 1)

const driftReport = (
  path: string,
  ref: string,
  dir: string,
  listVerdict: ListVerdict,
  counts: {
    readonly untracked: readonly string[]
    readonly stillTracked: readonly string[]
    readonly altered: readonly string[]
    readonly supportAltered: readonly string[]
  },
): Effect.Effect<number, never, never> =>
  Effect.as(
    Effect.andThen(
      Effect.logError(`✗ ${path} drifted from upstream at ${ref}:${dir}`),
      Match.tag(listVerdict, {
        Matches: () => Effect.void,
        Drifted: (drifted) =>
          Effect.andThen(
            Effect.forEach(drifted.extra, (file) => Effect.logError(`    not an imported upstream test: ${file}`), { concurrency: 1 }),
            Effect.forEach(drifted.missing, (file) => Effect.logError(`    imported upstream test with no record: ${file}`), { concurrency: 1 }),
          ),
      }),
    ),
    1,
  )

const listFailure = (
  path: string,
  ref: string,
  dir: string,
  listVerdict: ListVerdict,
  counts: { readonly untracked: readonly string[]; readonly stillTracked: readonly string[]; readonly altered: readonly string[]; readonly supportAltered: readonly string[] },
): Effect.Effect<number, never, never> =>
  Match.value(
    listVerdict._tag === 'Drifted' ||
      counts.untracked.length + counts.stillTracked.length + counts.altered.length + counts.supportAltered.length > 0,
  ).pipe(
    Match.when(true, () => driftReport(path, ref, dir, listVerdict, counts)),
    Match.orElse(() => Effect.succeed(0)),
  )

const supportedAlterations = (
  member: Member,
  upBlobs: Readonly<Record<string, string>>,
  tracked: HashSet.HashSet<string>,
): Effect.Effect<readonly string[], GuardError, Shell> =>
  Effect.gen(function*() {
    const support = importedSupport(Object.keys(upBlobs)).filter((file) => HashSet.has(tracked, `${member.dir}/${file}`))
    return differingBlobs(support, yield* worktreeBlobs(member.dir, support), upBlobs)
  })

const memberComparison = (
  member: Member,
  manifest: ManifestValue,
  upBlobs: Readonly<Record<string, string>>,
  tracked: HashSet.HashSet<string>,
  write: boolean,
): Effect.Effect<Outcome, GuardError, Shell> =>
  Effect.gen(function*() {
    const ported = manifest.ported ?? []
    const retired = manifest.retired ?? []
    const recorded = [...ported.map((entry) => entry.upstream), ...retired.map((entry) => entry.upstream)]
    const verbatim = Arr.filter(selectTests('all', Object.keys(upBlobs))._tag === 'Selected' ? [] : [], () => true)
    const files = write ? verbatim : manifest.files
    const support = importedSupport(Object.keys(upBlobs)).filter((file) => HashSet.has(tracked, `${member.dir}/${file}`))
    const untracked = files.filter((file) => !HashSet.has(tracked, `${member.dir}/${file}`))
    const stillTracked = recordedButTracked(recorded, ported, tracked, member.dir)
    const altered = differingBlobs(files, yield* worktreeBlobs(member.dir, files), upBlobs).filter((file) => !untracked.includes(file))
    const supportAltered = yield* supportedAlterations(member, upBlobs, tracked)
    const failure = yield* listFailure(
      `${member.dir}/${MANIFEST}`,
      member.dir,
      member.dir,
      judge(files, verbatim),
      { untracked, stillTracked, altered, supportAltered },
    )
    return { failed: failure, unformatted: [...files.map((file) => `${member.dir}/${file}`)] }
  })

const memberOutcome = (
  familyPath: string,
  family: FamilyValue,
  members: readonly Member[],
  options: Option.Option<Readonly<Record<string, JsonValue>>>,
  tracked: HashSet.HashSet<string>,
  write: boolean,
  member: Member,
): Effect.Effect<Outcome, GuardError, Shell> =>
  Effect.gen(function*() {
    const path = `${member.dir}/${MANIFEST}`
    const manifest = yield* readJson(ManifestSchema, path)
    const upBlobs = yield* upstreamBlobs(family, upstreamDir(family, member.key))
    const selection = selectTests(family.tests, Object.keys(upBlobs))
    const selectionFailure = yield* Match.tag(selection, {
      Absent: (absent) => absentSelection(familyPath, absent, family.source.ref),
      Selected: () => Effect.succeed(0),
    })
    const comparison = yield* memberComparison(member, manifest, upBlobs, tracked, write)
    const ports = yield* checkPorts(member.dir, upBlobs, manifest.ported ?? [])
    const projects = yield* Option.match(options, {
      onNone: () => Effect.succeed(0),
      onSome: (compilerOptions) =>
        syncTestProjects(
          member,
          members,
          manifest,
          comparison.unformatted.map((file) => file.slice(`${member.dir}/`.length)),
          [`${member.dir}/${MANIFEST}`],
          compilerOptions,
          write,
        ),
    })
    return { failed: selectionFailure + comparison.failed + ports + projects, unformatted: comparison.unformatted }
  })
