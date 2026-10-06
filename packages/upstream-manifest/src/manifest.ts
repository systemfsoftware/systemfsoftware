/// <reference types="vitest/importMeta" />
import { HashSet, Match, Option, Schema } from 'effect'
import { dual } from 'effect/Function'

import {
  type Addition,
  type Exports,
  type ExportsEntry,
  type Family,
  type FamilyPackage,
  type InPlace,
  type InPlaceVerdict,
  type Json,
  type ListVerdict,
  type Manifest,
  type Ported,
  type PortRegion,
  type PortVerdict,
  type Selection,
  type UpstreamTestProject,
  type VitestReport,
} from './domain.schema.js'

export type {
  Addition,
  Exports,
  Family,
  FamilyPackage,
  InPlace,
  InPlaceVerdict,
  Json,
  ListVerdict,
  Manifest,
  Member,
  Ported,
  PortRegion,
  PortVerdict,
  Retired,
  Selection,
  VitestReport,
} from './domain.schema.js'
export { GuardError } from './guard-error.schema.js'
export { canonical, parseJson, stringifyJson } from './json.js'

export const FAMILY_MANIFEST = 'upstream-family.json'
export const MANIFEST = 'upstream-tests.json'
export const DPRINT = 'dprint.json'
export const TEST_FILE = /\.test\.tsx?$/
export const PORT_BEGIN = '// port:begin '
export const PORT_END = '// port:end'
/** The trailers a `git subtree` squash commit records: the dir it vendored, and the upstream commit. */
export const SUBTREE_DIR = 'git-subtree-dir:'
export const SUBTREE_SPLIT = 'git-subtree-split:'
export const UPSTREAM_TEST_PROJECT = 'tsconfig.upstream-test.json'
export const REPO_TEST_PROJECT = 'tsconfig.test.json'
export const SOLUTION_PROJECT = 'tsconfig.json'
export const SOURCE_CONDITION = '@systemfsoftware/source'

const everyTrue = (values: readonly boolean[]): boolean => values.every((value) => value)

const not = (value: boolean): boolean => !value

const orDefault = <A>(value: A | undefined, fallback: A): A => value ?? fallback

const join = dual<
  (path: string) => (base: string) => string,
  (base: string, path: string) => string
>(2, (base, path) => (path === '.' ? base : `${base}/${path}`))

const sharedPrefix = (from: readonly string[], to: readonly string[]): number => {
  const mismatch = from.findIndex((segment, index) => to[index] !== segment)
  return mismatch < 0 ? Math.min(from.length, to.length) : mismatch
}

/**
 * The path of `to` relative to `from`, over the repo's POSIX-style relative
 * paths. Kept pure so the decisions stay free of the runtime's path module.
 */
export const relativePath = dual<
  (to: string) => (from: string) => string,
  (from: string, to: string) => string
>(2, (from, to) => {
  const fromParts = from.split('/').filter((segment) => segment.length > 0)
  const toParts = to.split('/').filter((segment) => segment.length > 0)
  const shared = sharedPrefix(fromParts, toParts)
  const up = fromParts.slice(shared).map(() => '..')
  return [...up, ...toParts.slice(shared)].join('/')
})

export const packageDir = dual<
  (key: string) => (familyDir: string) => string,
  (familyDir: string, key: string) => string
>(2, (familyDir, key) => join(familyDir, key))

const memberPackage = (family: Family, key: string): FamilyPackage | undefined => family.packages[key]

const upstreamOf = (pkg: FamilyPackage | undefined): string | undefined => pkg?.upstream

export const upstreamDir = dual<
  (key: string) => (family: Family) => string,
  (family: Family, key: string) => string
>(2, (family, key) => join(family.source.root, orDefault(upstreamOf(memberPackage(family, key)), key)))

export const upstreamTestProject = dual<
  (additions: readonly Addition[], files: readonly string[]) => (
    upstreamOptions: Readonly<Record<string, Json>>,
  ) => UpstreamTestProject,
  (
    upstreamOptions: Readonly<Record<string, Json>>,
    additions: readonly Addition[],
    files: readonly string[],
  ) => UpstreamTestProject
>(3, (upstreamOptions, additions, files): UpstreamTestProject => ({
  $schema: 'https://json.schemastore.org/tsconfig',
  compilerOptions: {
    ...upstreamOptions,
    ...Object.fromEntries(additions.map((addition) => [addition.option, addition.value])),
  },
  include: [...files],
}))

const sourceOf = (entry: ExportsEntry): Option.Option<string> =>
  Match.value(entry).pipe(
    Match.when((inner): inner is string => typeof inner === 'string', () => Option.none<string>()),
    Match.orElse((conditions) => Option.fromNullishOr(conditions[SOURCE_CONDITION])),
  )

const dotted = (target: string): string => (target.startsWith('.') ? target : `./${target}`)

type ForkTarget = { readonly dir: string; readonly specifier: string; readonly exports: Exports }

const entriesOf = dual<
  (subpath: string, entry: ExportsEntry) => (
    pkg: ForkTarget,
  ) => ReadonlyArray<readonly [string, readonly string[]]>,
  (
    pkg: ForkTarget,
    fromDir: string,
    subpath: string,
    entry: ExportsEntry,
  ) => ReadonlyArray<readonly [string, readonly string[]]>
>(4, (pkg, fromDir, subpath, entry) =>
  Option.match(sourceOf(entry), {
    onNone: () => [],
    onSome: (
      source,
    ) => [[`${pkg.specifier}${subpath.slice(1)}`, [dotted(relativePath(fromDir, `${pkg.dir}/${source.slice(2)}`))]]],
  }))

export const forkPaths = dual<
  (packages: ReadonlyArray<ForkTarget>) => (fromDir: string) => Record<string, readonly string[]>,
  (fromDir: string, packages: ReadonlyArray<ForkTarget>) => Record<string, readonly string[]>
>(2, (fromDir, packages) =>
  Object.fromEntries(
    packages
      .flatMap((pkg) =>
        Object.entries(pkg.exports).flatMap(([subpath, entry]) => entriesOf(pkg, fromDir, subpath, entry))
      )
      .toSorted(([a], [b]) => a.localeCompare(b)),
  ))

const testFilesOf = (upstreamFiles: readonly string[]): readonly string[] =>
  upstreamFiles.filter((path) => TEST_FILE.test(path)).toSorted()

const absentTests = (tests: readonly string[], present: HashSet.HashSet<string>): readonly string[] =>
  tests.filter((path) => !HashSet.has(present, path))

const selected = (tests: readonly string[]): Selection => ({ _tag: 'Selected', tests })

const absentVerdict = (missing: readonly string[]): Selection => ({ _tag: 'Absent', missing })

const listedVerdict = (tests: readonly string[], upstreamFiles: readonly string[]): Selection => {
  const missing = absentTests(tests, HashSet.fromIterable(upstreamFiles))
  return missing.length === 0 ? selected([...tests].toSorted()) : absentVerdict(missing)
}

export const selectTests = dual<
  (upstreamFiles: readonly string[]) => (tests: Family['tests']) => Selection,
  (tests: Family['tests'], upstreamFiles: readonly string[]) => Selection
>(2, (tests, upstreamFiles): Selection =>
  Match.value(tests).pipe(
    Match.when('all', () => selected(testFilesOf(upstreamFiles))),
    Match.orElse((listed) => listedVerdict(listed, upstreamFiles)),
  ))

const isTypescript = (path: string): boolean => /\.tsx?$/.test(path)

const isTest = (path: string): boolean => TEST_FILE.test(path)

const inSrc = (path: string): boolean => path.startsWith('src/')

const isSrcJson = (path: string): boolean => path.startsWith('src/') && path.endsWith('.json')

const isNonSrcTypeScript = (path: string): boolean =>
  everyTrue([isTypescript(path), not(isTest(path)), not(inSrc(path))])

const isSupport = (path: string): boolean => isNonSrcTypeScript(path) || isSrcJson(path)

export const importedSupport = (upstreamFiles: readonly string[]): readonly string[] =>
  upstreamFiles.filter(isSupport).toSorted()

/**
 * Whether a member copies any upstream support file. A member that runs an
 * in-place suite executes it from the read-only subtree and copies nothing, so a
 * manifest recording in-place files and nothing else — no verbatim `files`, no
 * `ported` entries — imports no support: a same-named file of its own is its own,
 * never a copy to grade against upstream's bytes.
 */
export const importsSupport = (manifest: Manifest): boolean =>
  not(everyTrue([
    orDefault(manifest.inPlace, []).length > 0,
    manifest.files.length === 0,
    orDefault(manifest.ported, []).length === 0,
  ]))

const without = (files: readonly string[], claimed: HashSet.HashSet<string>): readonly string[] =>
  files.filter((file) => !HashSet.has(claimed, file))

export const judge = dual<
  (expected: readonly string[]) => (listed: readonly string[]) => ListVerdict,
  (listed: readonly string[], expected: readonly string[]) => ListVerdict
>(2, (listed, expected): ListVerdict => {
  const want = HashSet.fromIterable(expected)
  const have = HashSet.fromIterable(listed)
  const extra = without(listed, want)
  const missing = without(expected, have)
  return everyTrue([extra.length === 0, missing.length === 0])
    ? { _tag: 'Matches' }
    : { _tag: 'Drifted', extra, missing }
})

export const differingBlobs = dual<
  (fork: Readonly<Record<string, string>>, upstream: Readonly<Record<string, string>>) => (
    files: readonly string[],
  ) => readonly string[],
  (
    files: readonly string[],
    fork: Readonly<Record<string, string>>,
    upstream: Readonly<Record<string, string>>,
  ) => readonly string[]
>(3, (files, fork, upstream) => files.filter((file) => fork[file] !== upstream[file]))

export const unclaimed = dual<
  (claimed: readonly string[]) => (manifests: readonly string[]) => readonly string[],
  (manifests: readonly string[], claimed: readonly string[]) => readonly string[]
>(2, (manifests, claimed) => without(manifests, HashSet.fromIterable(claimed)).toSorted())

/** The vitest assertion statuses that mean the assertion actually ran. */
const EXECUTED_STATUS: Record<string, true> = { passed: true, failed: true }

const ran = (status: string): boolean => EXECUTED_STATUS[status] === true

type TestResult = VitestReport['testResults'][number]
type AssertionResult = TestResult['assertionResults'][number]

/** The upstream file an assertion names through its `meta`, if any. */
const assertionClaim = (assertion: AssertionResult): Option.Option<string> =>
  Option.fromNullishOr(assertion.meta?.upstreamFile)

const ranToCompletion = (result: TestResult): boolean =>
  result.assertionResults.some((assertion) => ran(assertion.status))

/** The `${subtree}/${file}` a ran assertion claims; a skipped or pending one claims nothing. */
const executedClaim = (assertion: AssertionResult): Option.Option<string> =>
  Match.value(ran(assertion.status)).pipe(
    Match.when(true, () => assertionClaim(assertion)),
    Match.orElse(() => Option.none<string>()),
  )

/**
 * Every path the vitest JSON report shows collected and executed: each test file
 * whose entry ran an assertion, and each `<subtree>/<file>` a ran assertion's
 * `meta.upstreamFile` names. A claim is exactly the repository-relative path, so
 * the suffix rule that matches a result's name matches a claim too.
 */
export const reportedFiles = (report: VitestReport): HashSet.HashSet<string> =>
  HashSet.fromIterable([
    ...report.testResults.filter(ranToCompletion).map((result) => result.name),
    ...report.testResults.flatMap((result) =>
      result.assertionResults.flatMap((assertion) => Option.toArray(executedClaim(assertion)))
    ),
  ])

/** The values in first-seen order, each once. */
const unique = (values: readonly string[]): readonly string[] =>
  values.reduce<readonly string[]>((out, value) => (out.includes(value) ? out : [...out, value]), [])

/**
 * Every distinct `<subtree>/<file>` a report's assertions name through
 * `meta.upstreamFile`, whatever their status — the claims a stray-claim judgment reads.
 */
export const claimedFiles = (report: VitestReport): readonly string[] =>
  unique(
    report.testResults.flatMap((result) =>
      result.assertionResults.flatMap((assertion) => Option.toArray(assertionClaim(assertion)))
    ),
  )

const namedBy = (subtree: string, file: string) => (name: string): boolean => name.endsWith(`${subtree}/${file}`)

const isReported = (subtree: string, file: string, reported: HashSet.HashSet<string>): boolean =>
  [...reported].some(namedBy(subtree, file))

/** The in-place files the report does not show collected and executed. */
export const unreportedFiles = dual<
  (subtree: string, files: readonly string[]) => (reported: HashSet.HashSet<string>) => readonly string[],
  (subtree: string, files: readonly string[], reported: HashSet.HashSet<string>) => readonly string[]
>(3, (subtree, files, reported) => files.filter((file) => !isReported(subtree, file, reported)))

/** The claims that name no in-place file any record declares. */
export const strayClaims = dual<
  (known: HashSet.HashSet<string>) => (claims: readonly string[]) => readonly string[],
  (claims: readonly string[], known: HashSet.HashSet<string>) => readonly string[]
>(2, (claims, known) => claims.filter((claim) => !HashSet.has(known, claim)))

/** Every file an in-place record executes, across all of a member's records. */
export const inPlaceFiles = (manifest: Manifest): readonly string[] =>
  (manifest.inPlace ?? []).flatMap((record) => record.files)

/** Every repository-relative path an in-place record executes: `<subtree>/<file>`. */
export const inPlaceClaims = (manifest: Manifest): readonly string[] =>
  (manifest.inPlace ?? []).flatMap((record) => record.files.map((file) => `${record.subtree}/${file}`))

/**
 * The upstream commit a subtree's own `git-subtree-split:` trailer pins, read from
 * the message of the newest commit that vendored it. The pin is the subtree's own
 * metadata — never a value the record may name for itself.
 */
export const pinnedCommit = (message: string): Option.Option<string> =>
  Option.fromNullishOr(message.split('\n').find((line) => line.trim().startsWith(SUBTREE_SPLIT))).pipe(
    Option.map((line) => line.trim().slice(SUBTREE_SPLIT.length).trim()),
    Option.filter((pin) => pin.length > 0),
  )

/** The paths a `--report <path>` invocation supplies, in argument order. */
export const reportPaths = (args: readonly string[]): readonly string[] =>
  args.flatMap((arg, index) =>
    arg === '--report'
      ? Option.toArray(
        Option.fromNullishOr(args[index + 1]).pipe(Option.filter((value) => !value.startsWith('--'))),
      )
      : []
  )

/** The supplied report paths the repository tracks — a report must be run output, never a committed file. */
export const trackedReports = dual<
  (reports: readonly string[]) => (tracked: HashSet.HashSet<string>) => readonly string[],
  (reports: readonly string[], tracked: HashSet.HashSet<string>) => readonly string[]
>(2, (reports, tracked): readonly string[] => reports.filter((path) => HashSet.has(tracked, path)))

const absentFromSubtree = (record: InPlace, tracked: HashSet.HashSet<string>): readonly string[] =>
  record.files.filter((file) => !HashSet.has(tracked, `${record.subtree}/${file}`))

/**
 * Grade one in-place record against the subtree's own pin, the tracked tree and
 * the files the supplied reports show executed. One verdict per record, in the
 * order that stops it: unpinned, then a commit the subtree never held, then files
 * the subtree does not track or no report shows run.
 */
export const judgeInPlace = dual<
  (
    record: InPlace,
    pinned: Option.Option<string>,
    tracked: HashSet.HashSet<string>,
  ) => (reported: HashSet.HashSet<string>) => InPlaceVerdict,
  (
    record: InPlace,
    pinned: Option.Option<string>,
    tracked: HashSet.HashSet<string>,
    reported: HashSet.HashSet<string>,
  ) => InPlaceVerdict
>(4, (record, pinned, tracked, reported): InPlaceVerdict =>
  Option.match(pinned, {
    onNone: (): InPlaceVerdict => ({ _tag: 'Unpinned' }),
    onSome: (pin) =>
      Match.value(pin === record.commit).pipe(
        Match.when(false, (): InPlaceVerdict => ({ _tag: 'CommitMismatch', pinned: pin })),
        Match.orElse((): InPlaceVerdict => {
          const absent = absentFromSubtree(record, tracked)
          const unreported = unreportedFiles(record.subtree, record.files, reported)
          return everyTrue([absent.length === 0, unreported.length === 0])
            ? { _tag: 'Graded' }
            : { _tag: 'Unrun', absent, unreported }
        }),
      ),
  }))

const duplicated = (values: readonly string[]): readonly string[] =>
  values.reduce<{ readonly seen: HashSet.HashSet<string>; readonly dup: readonly string[] }>(
    (state, value) =>
      HashSet.has(state.seen, value)
        ? { seen: state.seen, dup: [...state.dup, value] }
        : { seen: HashSet.add(state.seen, value), dup: state.dup },
    { seen: HashSet.empty<string>(), dup: [] },
  ).dup

/** The upstream files a member records under more than one kind — files, ported, retired or in-place. */
export const duplicateRecords = (manifest: Manifest): readonly string[] =>
  duplicated([
    ...manifest.files,
    ...orDefault(manifest.ported, []).map((entry) => entry.upstream),
    ...orDefault(manifest.retired, []).map((entry) => entry.upstream),
    ...inPlaceFiles(manifest),
  ])

export const stripCr = (line: string): string => (line.endsWith('\r') ? line.slice(0, -1) : line)

const firstChange = (
  upstream: readonly string[],
  port: readonly string[],
  at: number,
): Option.Option<number> =>
  Option.fromNullishOr(upstream.findIndex((line, index) => port[at + index] !== line)).pipe(
    Option.filter((offset) => offset >= 0),
    Option.map((offset) => at + offset),
  )

const unmarked = (begin: number, end: number): boolean => begin < 0 || end < 0

const shifted = (changed: Option.Option<number>, begin: number, at: number, beforeLength: number): boolean =>
  Option.isSome(changed) || begin - at !== beforeLength

const changedLine = (
  changed: Option.Option<number>,
  begin: number,
  at: number,
  beforeLength: number,
): number => Option.getOrElse(changed, () => at + Math.min(beforeLength, begin - at)) + 1

const shiftedTail = (
  changed: Option.Option<number>,
  at: number,
  portLength: number,
  afterLength: number,
): boolean => Option.isSome(changed) || portLength - at !== afterLength

const tailLine = (
  changed: Option.Option<number>,
  at: number,
  portLength: number,
  afterLength: number,
): number => Option.getOrElse(changed, () => at + Math.min(afterLength, portLength - at)) + 1

type Scan = { readonly up: number; readonly at: number }
type ScanState = { readonly scan: Scan; readonly verdict: Option.Option<PortVerdict> }

const beginOf = (marks: readonly string[], region: PortRegion, at: number): number =>
  marks.indexOf(`${PORT_BEGIN}${region.case}`, at)

const endOf = (marks: readonly string[], begin: number): number => marks.indexOf(PORT_END, begin)

const nextScan = (scan: Scan, region: PortRegion, marks: readonly string[]): Scan => {
  const end = endOf(marks, beginOf(marks, region, scan.at))
  return { up: region.lines[1], at: end + 1 }
}

const mismatch = (
  scan: Scan,
  region: PortRegion,
  upstream: readonly string[],
  port: readonly string[],
  begin: number,
): Option.Option<PortVerdict> => {
  const before = upstream.slice(scan.up, region.lines[0] - 1)
  const changed = firstChange(before, port, scan.at)
  return shifted(changed, begin, scan.at, before.length)
    ? Option.some({ _tag: 'Changed', line: changedLine(changed, begin, scan.at, before.length) })
    : Option.none()
}

const regionVerdict = (
  scan: Scan,
  region: PortRegion,
  upstream: readonly string[],
  port: readonly string[],
  marks: readonly string[],
): Option.Option<PortVerdict> => {
  const begin = beginOf(marks, region, scan.at)
  return unmarked(begin, endOf(marks, begin))
    ? Option.some({ _tag: 'Unmarked' })
    : mismatch(scan, region, upstream, port, begin)
}

const advance = (
  state: ScanState,
  region: PortRegion,
  upstream: readonly string[],
  port: readonly string[],
  marks: readonly string[],
): ScanState =>
  Option.match(state.verdict, {
    onSome: () => state,
    onNone: () =>
      Option.match(regionVerdict(state.scan, region, upstream, port, marks), {
        onSome: (verdict) => ({ scan: state.scan, verdict: Option.some(verdict) }),
        onNone: () => ({ scan: nextScan(state.scan, region, marks), verdict: Option.none() }),
      }),
  })

const afterVerdict = (scan: Scan, upstream: readonly string[], port: readonly string[]): PortVerdict => {
  const after = upstream.slice(scan.up)
  const changed = firstChange(after, port, scan.at)
  return shiftedTail(changed, scan.at, port.length, after.length)
    ? { _tag: 'Changed', line: tailLine(changed, scan.at, port.length, after.length) }
    : { _tag: 'Faithful' }
}

export const judgePort = dual<
  (rawPort: readonly string[], regions: readonly PortRegion[]) => (rawUpstream: readonly string[]) => PortVerdict,
  (
    rawUpstream: readonly string[],
    rawPort: readonly string[],
    regions: readonly PortRegion[],
  ) => PortVerdict
>(3, (rawUpstream, rawPort, regions): PortVerdict => {
  const upstream = rawUpstream.map(stripCr)
  const port = rawPort.map(stripCr)
  const marks = port.map((line) => line.trim())
  const finished = regions.reduce<ScanState>(
    (state, region) => advance(state, region, upstream, port, marks),
    { scan: { up: 0, at: 0 }, verdict: Option.none() },
  )
  return Option.getOrElse(finished.verdict, () => afterVerdict(finished.scan, upstream, port))
})

export const recordedButTracked = dual<
  (ported: readonly Ported[], tracked: HashSet.HashSet<string>, dir: string) => (
    recorded: readonly string[],
  ) => readonly string[],
  (
    recorded: readonly string[],
    ported: readonly Ported[],
    tracked: HashSet.HashSet<string>,
    dir: string,
  ) => readonly string[]
>(4, (recorded, ported, tracked, dir) => {
  const portPaths = HashSet.fromIterable(ported.map((entry) => entry.port))
  return recorded.filter((file) => !HashSet.has(portPaths, file) && HashSet.has(tracked, `${dir}/${file}`))
})

/**
 * The in-source property laws for this module's pure rows. Each law relates a
 * decision's verdict to a value built independently — a spec relation, a set
 * difference, or a constructed draft port — so a constant implementation
 * falsifies it and every law can go red.
 */
if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown leaves `import.meta.vitest` undefined in the build,
  // so a static import would enter the published module graph.
  const { it } = await import('@systemfsoftware/vitest')

  const FilePath = Schema.Struct({
    dir: Schema.Literals(['', 'src/', 'test/', 'deep/dir/']),
    stem: Schema.String,
    suffix: Schema.Literals(['.test.ts', '.test.tsx', '.ts', '.tsx', '.json', '.js']),
  })
  type FilePath = typeof FilePath.Type

  const Blob = Schema.Struct({
    path: Schema.String,
    fork: Schema.String,
    upstream: Schema.String,
  })
  type Blob = typeof Blob.Type

  const FamilySpec = Schema.Struct({
    root: Schema.String,
    key: Schema.String,
    upstream: Schema.optional(Schema.String),
  })
  type FamilySpec = typeof FamilySpec.Type

  const ForkSpec = Schema.Struct({
    dir: Schema.String,
    specifier: Schema.String,
    subpath: Schema.String,
    source: Schema.String,
  })
  type ForkSpec = typeof ForkSpec.Type

  const pathOf = (part: FilePath): string => `${part.dir}${part.stem}${part.suffix}`

  const isMatches = (verdict: ListVerdict): boolean =>
    Match.valueTags(verdict, { Matches: () => true, Drifted: () => false })

  const isSelected = (selection: Selection): boolean =>
    Match.valueTags(selection, { Selected: () => true, Absent: () => false })

  const isAbsent = (selection: Selection): boolean =>
    Match.valueTags(selection, { Selected: () => false, Absent: () => true })

  const isFaithful = (verdict: PortVerdict): boolean =>
    Match.valueTags(verdict, { Faithful: () => true, Changed: () => false, Unmarked: () => false })

  const isChanged = (verdict: PortVerdict): boolean =>
    Match.valueTags(verdict, { Faithful: () => false, Changed: () => true, Unmarked: () => false })

  const isUnmarked = (verdict: PortVerdict): boolean =>
    Match.valueTags(verdict, { Faithful: () => false, Changed: () => false, Unmarked: () => true })

  const lineOf = (verdict: PortVerdict): number =>
    Match.valueTags(verdict, { Faithful: () => -1, Unmarked: () => -1, Changed: (changed) => changed.line })

  const testsOf = (selection: Selection): readonly string[] =>
    Match.valueTags(selection, { Selected: (selected) => selected.tests, Absent: () => [] })

  const missingOf = (selection: Selection): readonly string[] =>
    Match.valueTags(selection, { Selected: () => [], Absent: (absent) => absent.missing })

  const appended = (base: string, path: string): string => (path === '.' ? base : `${base}/${path}`)

  const either = (values: readonly boolean[]): boolean => values.some((value) => value)

  const isTestPath = (path: string): boolean => TEST_FILE.test(path)

  const isTypeScriptPath = (path: string): boolean => path.endsWith('.ts') || path.endsWith('.tsx')

  const isSrcPath = (path: string): boolean => path.startsWith('src/')

  const isSrcJsonPath = (path: string): boolean => everyTrue([isSrcPath(path), path.endsWith('.json')])

  const isNonSrcTypeScriptPath = (path: string): boolean =>
    everyTrue([isTypeScriptPath(path), not(isTestPath(path)), not(isSrcPath(path))])

  const isSupportPath = (path: string): boolean => either([isNonSrcTypeScriptPath(path), isSrcJsonPath(path)])

  const packagesOf = (spec: FamilySpec): Family['packages'] =>
    spec.upstream === undefined ? {} : { [spec.key]: { upstream: spec.upstream } }

  const reflexive = (subject: typeof judge, xs: readonly string[]): boolean => isMatches(subject(xs, xs))

  const setJudgment = (subject: typeof judge, listed: readonly string[], expected: readonly string[]): boolean => {
    const want = HashSet.fromIterable(expected)
    const have = HashSet.fromIterable(listed)
    const extra = listed.filter((file) => !HashSet.has(want, file))
    const missing = expected.filter((file) => !HashSet.has(have, file))
    const verdict = subject(listed, expected)
    const drifted = not(everyTrue([extra.length === 0, missing.length === 0]))
    return Match.valueTags(verdict, {
      Matches: () => not(drifted),
      Drifted: (value) =>
        everyTrue([
          drifted,
          value.extra.join('|') === extra.join('|'),
          value.missing.join('|') === missing.join('|'),
        ]),
    })
  }

  const regionBounds = (length: number, at: number, span: number): readonly [number, number] => {
    const start = ((at % length) + length) % length
    const end = Math.min(start + Math.max(span, 1), length)
    return [start + 1, end]
  }

  const padTo = (lines: readonly string[], size: number): readonly string[] =>
    lines.length >= size
      ? lines
      : [...lines, ...Array.from({ length: size - lines.length }, (_, index) => `pad${String(index)}`)]

  const prefixed = (lines: readonly string[], marker: string): readonly string[] =>
    lines.map((line) => `${marker}${line}`)

  const draftOf = (
    rawUpstream: readonly string[],
    rawBlock: readonly string[],
    at: number,
    span: number,
  ): { readonly lines: readonly string[]; readonly block: readonly string[]; readonly region: PortRegion } => {
    const lines = prefixed(padTo(rawUpstream, 3), 'u')
    const block = prefixed(rawBlock, 'b')
    const [start, end] = regionBounds(lines.length, at, span)
    return { lines, block, region: { case: 'k', lines: [start, end] } }
  }

  const withRegion = (lines: readonly string[], region: PortRegion, block: readonly string[]): readonly string[] => [
    ...lines.slice(0, region.lines[0] - 1),
    `${PORT_BEGIN}k`,
    ...block,
    PORT_END,
    ...lines.slice(region.lines[1]),
  ]

  const draftFaithful = (
    subject: typeof judgePort,
    rawUpstream: readonly string[],
    rawBlock: readonly string[],
    at: number,
    span: number,
  ): boolean => {
    const draft = draftOf(rawUpstream, rawBlock, at, span)
    return isFaithful(
      subject(draft.lines, withRegion(draft.lines, draft.region, draft.block), [draft.region]),
    )
  }

  const pairFaithful = (
    subject: typeof judgePort,
    rawUpstream: readonly string[],
    blockA: readonly string[],
    blockB: readonly string[],
  ): boolean => {
    const lines = prefixed(padTo(rawUpstream, 2), 'u')
    const length = lines.length
    const half = Math.max(1, Math.floor(length / 2))
    const regions: readonly PortRegion[] = [
      { case: 'k', lines: [1, half] as const },
      { case: 'j', lines: [half + 1, length] as const },
    ]
    const port = [
      `${PORT_BEGIN}k`,
      ...prefixed(blockA, 'b'),
      PORT_END,
      `${PORT_BEGIN}j`,
      ...prefixed(blockB, 'b'),
      PORT_END,
    ]
    return isFaithful(subject(lines, port, regions))
  }

  const earlierChanged = (
    subject: typeof judgePort,
    rawUpstream: readonly string[],
    rawBlock: readonly string[],
    at: number,
    span: number,
  ): boolean => {
    const lines = prefixed(padTo(rawUpstream, 3), 'u')
    const length = lines.length
    const start = 2 + ((at % (length - 1)) + (length - 1)) % (length - 1)
    const end = Math.min(start + Math.max(span, 1) - 1, length)
    const region: PortRegion = { case: 'k', lines: [start, end] as const }
    const port = withRegion(lines, region, prefixed(rawBlock, 'b'))
    return isChanged(subject(lines, [`z${port[0] ?? ''}`, ...port.slice(1)], [region]))
  }

  const middleChanged = (
    subject: typeof judgePort,
    rawUpstream: readonly string[],
    blockA: readonly string[],
    blockB: readonly string[],
  ): boolean => {
    const lines = prefixed(padTo(rawUpstream, 3), 'u')
    const regions: readonly PortRegion[] = [
      { case: 'k', lines: [1, 1] as const },
      { case: 'j', lines: [3, lines.length] as const },
    ]
    const port = [
      `${PORT_BEGIN}k`,
      ...prefixed(blockA, 'b'),
      PORT_END,
      `z${lines[1] ?? ''}`,
      `${PORT_BEGIN}j`,
      ...prefixed(blockB, 'b'),
      PORT_END,
    ]
    return isChanged(subject(lines, port, regions))
  }

  const laterChanged = (
    subject: typeof judgePort,
    rawUpstream: readonly string[],
    rawBlock: readonly string[],
    at: number,
    span: number,
  ): boolean => {
    const lines = prefixed(padTo(rawUpstream, 3), 'u')
    const length = lines.length
    const start = 2 + ((at % (length - 2)) + (length - 2)) % (length - 2)
    const end = Math.min(start + Math.max(span, 1) - 1, length - 1)
    const region: PortRegion = { case: 'k', lines: [start, end] as const }
    const block = prefixed(rawBlock, 'b')
    const port = withRegion(lines, region, block)
    const tail = start + block.length + 1
    return isChanged(subject(lines, [...port.slice(0, tail), `z${port[tail] ?? ''}`, ...port.slice(tail + 1)], [
      region,
    ]))
  }

  const unmarkedPort = (
    subject: typeof judgePort,
    rawUpstream: readonly string[],
    at: number,
    span: number,
  ): boolean => {
    const lines = prefixed(padTo(rawUpstream, 3), 'u')
    const [start, end] = regionBounds(lines.length, at, span)
    return isUnmarked(subject(lines, lines, [{ case: 'k', lines: [start, end] as const }]))
  }

  const crlfFaithful = (
    subject: typeof judgePort,
    rawUpstream: readonly string[],
    rawBlock: readonly string[],
    at: number,
    span: number,
  ): boolean => {
    const draft = draftOf(rawUpstream, rawBlock, at, span)
    const crlf = (lines: readonly string[]): readonly string[] => lines.map((line) => `${line}\r`)
    return isFaithful(
      subject(crlf(draft.lines), crlf(withRegion(draft.lines, draft.region, draft.block)), [draft.region]),
    )
  }

  const insertChanged = (
    subject: typeof judgePort,
    rawUpstream: readonly string[],
    rawBlock: readonly string[],
    at: number,
    span: number,
  ): boolean => {
    const draft = draftOf(rawUpstream, rawBlock, at, span)
    const region = draft.region
    const port = [
      ...draft.lines.slice(0, region.lines[0] - 1),
      'INSERTED',
      `${PORT_BEGIN}k`,
      ...draft.block,
      PORT_END,
      ...draft.lines.slice(region.lines[1]),
    ]
    const verdict = subject(draft.lines, port, [region])
    return everyTrue([isChanged(verdict), lineOf(verdict) === region.lines[0]])
  }

  const appendChanged = (
    subject: typeof judgePort,
    rawUpstream: readonly string[],
    rawBlock: readonly string[],
    at: number,
    span: number,
  ): boolean => {
    const draft = draftOf(rawUpstream, rawBlock, at, span)
    const region = draft.region
    const port = [...withRegion(draft.lines, region, draft.block), 'EXTRA']
    const verdict = subject(draft.lines, port, [region])
    const expected = region.lines[0] + draft.block.length + (draft.lines.length - region.lines[1]) + 2
    return everyTrue([isChanged(verdict), lineOf(verdict) === expected])
  }

  const allSelected = (subject: typeof selectTests, parts: ReadonlyArray<FilePath>): boolean => {
    const paths = parts.map(pathOf)
    const expected = paths.filter((path) => TEST_FILE.test(path)).toSorted()
    const verdict = subject('all', paths)
    return everyTrue([isSelected(verdict), testsOf(verdict).join('|') === expected.join('|')])
  }

  const listedSelected = (
    subject: typeof selectTests,
    listed: ReadonlyArray<FilePath>,
    extra: ReadonlyArray<FilePath>,
  ): boolean => {
    const listedPaths = listed.map(pathOf)
    const files = [...listedPaths, ...extra.map(pathOf)]
    const verdict = subject(listedPaths, files)
    return everyTrue([isSelected(verdict), testsOf(verdict).join('|') === [...listedPaths].toSorted().join('|')])
  }

  const listedAbsent = (
    subject: typeof selectTests,
    missing: ReadonlyArray<FilePath>,
    present: ReadonlyArray<FilePath>,
  ): boolean => {
    const missingPaths = missing.map((part) => `miss/${pathOf(part)}`)
    const presentPaths = present.map((part) => `keep/${pathOf(part)}`)
    const verdict = subject(missingPaths, presentPaths)
    return everyTrue([isAbsent(verdict), missingOf(verdict).join('|') === missingPaths.join('|')])
  }

  const dirMaps = (subject: typeof packageDir, dir: string, key: string): boolean =>
    subject(dir, key) === appended(dir, key)

  const familyMaps = (subject: typeof upstreamDir, spec: FamilySpec): boolean => {
    const family: Family = {
      name: 'family',
      reason: 'law',
      source: { ref: 'HEAD', root: spec.root },
      tests: 'all',
      packages: packagesOf(spec),
    }
    return subject(family, spec.key) === appended(spec.root, orDefault(spec.upstream, spec.key))
  }

  const differingSet = (subject: typeof differingBlobs, records: ReadonlyArray<Blob>): boolean => {
    const files = records.map((record) => record.path)
    const fork = Object.fromEntries(records.map((record) => [record.path, record.fork] as const))
    const upstream = Object.fromEntries(records.map((record) => [record.path, record.upstream] as const))
    const expected = files.filter((file) => fork[file] !== upstream[file])
    return subject(files, fork, upstream).join('|') === expected.join('|')
  }

  const unclaimedOnly = (
    subject: typeof unclaimed,
    manifests: readonly string[],
    claimed: readonly string[],
  ): boolean => {
    const claimedSet = HashSet.fromIterable(claimed)
    const expected = manifests.filter((manifest) => !HashSet.has(claimedSet, manifest)).toSorted()
    return subject(manifests, claimed).join('|') === expected.join('|')
  }

  const relativeLocal = (from: string, to: string): string => {
    const fromParts = from.split('/').filter((segment) => segment.length > 0)
    const toParts = to.split('/').filter((segment) => segment.length > 0)
    const mismatch = fromParts.findIndex((segment, index) => toParts[index] !== segment)
    const shared = mismatch < 0 ? Math.min(fromParts.length, toParts.length) : mismatch
    return [...fromParts.slice(shared).map(() => '..'), ...toParts.slice(shared)].join('/')
  }

  const dottedLocal = (target: string): string => (target.startsWith('.') ? target : `./${target}`)

  const exportPaths = (subject: typeof forkPaths, fromDir: string, parts: ReadonlyArray<ForkSpec>): boolean => {
    const packages = parts.map((part) => ({
      dir: part.dir,
      specifier: part.specifier,
      exports: { [part.subpath]: { [SOURCE_CONDITION]: part.source } },
    }))
    const expected = Object.fromEntries(
      parts
        .map(
          (part): readonly [string, readonly string[]] => [
            `${part.specifier}${part.subpath.slice(1)}`,
            [dottedLocal(relativeLocal(fromDir, `${part.dir}/${part.source.slice(2)}`))],
          ],
        )
        .toSorted(([left], [right]) => left.localeCompare(right)),
    )
    const actual = subject(fromDir, packages)
    const keys = Object.keys(expected)
    return everyTrue([
      Object.keys(actual).join('|') === keys.join('|'),
      keys.every((key) => orDefault(actual[key], []).join('|') === orDefault(expected[key], []).join('|')),
    ])
  }

  const supportFiles = (subject: typeof importedSupport, parts: ReadonlyArray<FilePath>): boolean => {
    const paths = parts.map(pathOf)
    const expected = paths.filter(isSupportPath).toSorted()
    return subject(paths).join('|') === expected.join('|')
  }

  const SupportShape = Schema.Struct({
    file: Schema.NonEmptyString,
    subtree: Schema.NonEmptyString,
    commit: Schema.NonEmptyString,
    verbatim: Schema.Boolean,
    ported: Schema.Boolean,
    inPlace: Schema.Boolean,
  })
  type SupportShape = typeof SupportShape.Type

  const portedEntry = (shape: SupportShape): Ported => ({
    upstream: shape.file,
    port: shape.file,
    blob: 'blob',
    reason: 'law',
    regions: [],
  })

  const when = <A>(flag: boolean, value: A): readonly A[] => (flag ? [value] : [])

  const supportManifest = (shape: SupportShape): Manifest => ({
    reason: 'law',
    removal: 'law',
    files: when(shape.verbatim, shape.file),
    ported: when(shape.ported, portedEntry(shape)),
    inPlace: when(shape.inPlace, { subtree: shape.subtree, commit: shape.commit, files: [shape.file] }),
  })

  /**
   * The decision restated as an independent model over the recorded kinds, so the
   * law pins the output to its input and no constant subject can satisfy it.
   */
  const supportModel = (shape: SupportShape): boolean =>
    not(everyTrue([shape.inPlace, not(shape.verbatim), not(shape.ported)]))

  const supportLaw = (subject: typeof importsSupport, shape: SupportShape): boolean =>
    subject(supportManifest(shape)) === supportModel(shape)

  const keptPathIgnored = (subject: typeof recordedButTracked, files: readonly string[]): boolean => {
    const recorded = files.map((file) => `r/${file}`)
    const ported: ReadonlyArray<Ported> = recorded.map((path) => ({
      upstream: path,
      port: path,
      blob: 'blob',
      reason: 'law',
      regions: [],
    }))
    const tracked = HashSet.fromIterable(recorded.map((file) => `p/${file}`))
    return subject(recorded, ported, tracked, 'p').length === 0
  }

  const movedPathReported = (subject: typeof recordedButTracked, files: readonly string[]): boolean => {
    const recorded = files.map((file) => `r/${file}`)
    const ported: ReadonlyArray<Ported> = files.map((file) => ({
      upstream: `r/${file}`,
      port: `moved/${file}`,
      blob: 'blob',
      reason: 'law',
      regions: [],
    }))
    const tracked = HashSet.fromIterable(recorded.map((file) => `p/${file}`))
    return subject(recorded, ported, tracked, 'p').join('|') === recorded.join('|')
  }

  const untrackedIgnored = (subject: typeof recordedButTracked, files: readonly string[]): boolean => {
    const recorded = files.map((file) => `r/${file}`)
    return subject(recorded, [], HashSet.empty<string>(), 'p').length === 0
  }

  const InPlaceDraft = Schema.Struct({
    subtree: Schema.String,
    commit: Schema.String,
    files: Schema.NonEmptyArray(Schema.String),
  })
  type InPlaceDraft = typeof InPlaceDraft.Type

  const recordOf = (draft: InPlaceDraft): InPlace => ({
    subtree: draft.subtree,
    commit: draft.commit,
    files: draft.files,
  })

  const subtreeKeys = (draft: InPlaceDraft): readonly string[] => draft.files.map((file) => `${draft.subtree}/${file}`)

  const isGraded = (verdict: InPlaceVerdict): boolean =>
    Match.valueTags(verdict, {
      Graded: () => true,
      Unpinned: () => false,
      CommitMismatch: () => false,
      Unrun: () => false,
    })

  const gradedLaw = (subject: typeof judgeInPlace, draft: InPlaceDraft): boolean =>
    isGraded(
      subject(
        recordOf(draft),
        Option.some(draft.commit),
        HashSet.fromIterable(subtreeKeys(draft)),
        HashSet.fromIterable(subtreeKeys(draft)),
      ),
    )

  const unpinnedLaw = (subject: typeof judgeInPlace, draft: InPlaceDraft): boolean =>
    Match.valueTags(subject(recordOf(draft), Option.none(), HashSet.empty<string>(), HashSet.empty<string>()), {
      Unpinned: () => true,
      Graded: () => false,
      CommitMismatch: () => false,
      Unrun: () => false,
    })

  const commitMismatchLaw = (
    subject: typeof judgeInPlace,
    draft: InPlaceDraft,
    suffix: string,
  ): boolean => {
    const pin = `${draft.commit}${suffix}`
    const verdict = subject(
      recordOf(draft),
      Option.some(pin),
      HashSet.fromIterable(subtreeKeys(draft)),
      HashSet.fromIterable(subtreeKeys(draft)),
    )
    return Match.valueTags(verdict, {
      CommitMismatch: (mismatch) => mismatch.pinned === pin,
      Graded: () => false,
      Unpinned: () => false,
      Unrun: () => false,
    })
  }

  const unrunLaw = (subject: typeof judgeInPlace, draft: InPlaceDraft, drop: number): boolean => {
    const keys = subtreeKeys(draft)
    const at = ((drop % keys.length) + keys.length) % keys.length
    const tracked = HashSet.fromIterable(keys.filter((_, index) => index !== at))
    const reported = HashSet.empty<string>()
    const verdict = subject(recordOf(draft), Option.some(draft.commit), tracked, reported)
    const expectedAbsent = draft.files.filter((file) => !HashSet.has(tracked, `${draft.subtree}/${file}`))
    const expectedUnreported = draft.files.filter((file) => !HashSet.has(reported, `${draft.subtree}/${file}`))
    return Match.valueTags(verdict, {
      Unrun: (unrun) =>
        everyTrue([
          unrun.absent.join('|') === expectedAbsent.join('|'),
          unrun.unreported.join('|') === expectedUnreported.join('|'),
        ]),
      Graded: () => false,
      Unpinned: () => false,
      CommitMismatch: () => false,
    })
  }

  const pinTrailerLaw = (subject: typeof pinnedCommit, lines: readonly string[], raw: string): boolean => {
    const pin = orDefault(raw.split('\n')[0], '').trim()
    const message = [...lines.map((line) => `x${line}`), `${SUBTREE_SPLIT} ${pin}`].join('\n')
    return Option.match(subject(message), {
      onNone: () => pin.length === 0,
      onSome: (found) => found === pin,
    })
  }

  const pinAbsentLaw = (subject: typeof pinnedCommit, lines: readonly string[]): boolean =>
    Option.isNone(subject(lines.map((line) => `x${line}`).join('\n')))

  const reportPathsLaw = (subject: typeof reportPaths, parts: readonly string[]): boolean => {
    const paths = parts.map((part) => `r/${part}`)
    return subject(paths.flatMap((path) => ['--report', path])).join('|') === paths.join('|')
  }

  const reportPathsFlagsLaw = (
    subject: typeof reportPaths,
    parts: readonly string[],
    flags: readonly string[],
  ): boolean => {
    const paths = parts.map((part) => `r/${part}`)
    const args = [
      ...flags.map((flag) => `--${flag}`),
      ...paths.flatMap((path) => ['--report', path]),
      ...flags.map((flag) => `--${flag}`),
    ]
    return subject(args).join('|') === paths.join('|')
  }

  const trackedReportsLaw = (
    subject: typeof trackedReports,
    reports: readonly string[],
    tracked: readonly string[],
  ): boolean => {
    const trackedSet = HashSet.fromIterable(tracked)
    const expected = reports.filter((path) => HashSet.has(trackedSet, path))
    return subject(reports, trackedSet).join('|') === expected.join('|')
  }

  it.prop(
    '∀xs_List_=Reflexive',
    { of: [Schema.Array(Schema.String)], subject: judge },
    (subject, [xs]) => reflexive(subject, xs),
  )

  it.prop(
    '∀s_Lists_≡SetJudgment',
    { of: [Schema.Array(Schema.String), Schema.Array(Schema.String)], subject: judge },
    (subject, [listed, expected]) => setJudgment(subject, listed, expected),
  )

  it.prop(
    '∀d_Draft_≡Faithful',
    {
      of: [Schema.NonEmptyArray(Schema.String), Schema.Array(Schema.String), Schema.Int, Schema.Int],
      subject: judgePort,
    },
    (subject, [upstream, block, at, span]) => draftFaithful(subject, upstream, block, at, span),
  )

  it.prop(
    '∀d_Pair_≡Faithful',
    {
      of: [Schema.NonEmptyArray(Schema.String), Schema.Array(Schema.String), Schema.Array(Schema.String)],
      subject: judgePort,
    },
    (subject, [upstream, blockA, blockB]) => pairFaithful(subject, upstream, blockA, blockB),
  )

  it.prop(
    '∀d_Earlier_⊥Faithful',
    {
      of: [Schema.NonEmptyArray(Schema.String), Schema.Array(Schema.String), Schema.Int, Schema.Int],
      subject: judgePort,
    },
    (subject, [upstream, block, at, span]) => earlierChanged(subject, upstream, block, at, span),
  )

  it.prop(
    '∀d_Middle_⊥Faithful',
    {
      of: [Schema.NonEmptyArray(Schema.String), Schema.Array(Schema.String), Schema.Array(Schema.String)],
      subject: judgePort,
    },
    (subject, [upstream, blockA, blockB]) => middleChanged(subject, upstream, blockA, blockB),
  )

  it.prop(
    '∀d_Later_⊥Faithful',
    {
      of: [Schema.NonEmptyArray(Schema.String), Schema.Array(Schema.String), Schema.Int, Schema.Int],
      subject: judgePort,
    },
    (subject, [upstream, block, at, span]) => laterChanged(subject, upstream, block, at, span),
  )

  it.prop(
    '∀d_Unmarked_⊥Marked',
    { of: [Schema.NonEmptyArray(Schema.String), Schema.Int, Schema.Int], subject: judgePort },
    (subject, [upstream, at, span]) => unmarkedPort(subject, upstream, at, span),
  )

  it.prop(
    '∀d_Crlf_≡Faithful',
    {
      of: [Schema.NonEmptyArray(Schema.String), Schema.Array(Schema.String), Schema.Int, Schema.Int],
      subject: judgePort,
    },
    (subject, [upstream, block, at, span]) => crlfFaithful(subject, upstream, block, at, span),
  )

  it.prop(
    '∀d_Insert_=Line',
    {
      of: [Schema.NonEmptyArray(Schema.String), Schema.Array(Schema.String), Schema.Int, Schema.Int],
      subject: judgePort,
    },
    (subject, [upstream, block, at, span]) => insertChanged(subject, upstream, block, at, span),
  )

  it.prop(
    '∀d_Append_=Line',
    {
      of: [Schema.NonEmptyArray(Schema.String), Schema.Array(Schema.String), Schema.Int, Schema.Int],
      subject: judgePort,
    },
    (subject, [upstream, block, at, span]) => appendChanged(subject, upstream, block, at, span),
  )

  it.prop(
    '∀f_Files_⊆Tests',
    { of: [Schema.Array(FilePath)], subject: selectTests },
    (subject, [files]) => allSelected(subject, files),
  )

  it.prop(
    '∀f_Listed_=Selected',
    { of: [Schema.NonEmptyArray(FilePath), Schema.Array(FilePath)], subject: selectTests },
    (subject, [listed, extra]) => listedSelected(subject, listed, extra),
  )

  it.prop(
    '∀f_Absent_⊥Present',
    { of: [Schema.NonEmptyArray(FilePath), Schema.Array(FilePath)], subject: selectTests },
    (subject, [missing, present]) => listedAbsent(subject, missing, present),
  )

  it.prop(
    '∀k_Keys_=PackageDir',
    { of: [Schema.String, Schema.String], subject: packageDir },
    (subject, [dir, key]) => dirMaps(subject, dir, key),
  )

  it.prop(
    '∀f_Family_=UpstreamDir',
    { of: [FamilySpec], subject: upstreamDir },
    (subject, [spec]) => familyMaps(subject, spec),
  )

  it.prop(
    '∀b_Blobs_=Differing',
    { of: [Schema.Array(Blob)], subject: differingBlobs },
    (subject, [records]) => differingSet(subject, records),
  )

  it.prop(
    '∀m_Manifests_⊇Unclaimed',
    { of: [Schema.Array(Schema.String), Schema.Array(Schema.String)], subject: unclaimed },
    (subject, [manifests, claimed]) => unclaimedOnly(subject, manifests, claimed),
  )

  it.prop(
    '∀p_Exports_=Specifiers',
    { of: [Schema.String, Schema.Array(ForkSpec)], subject: forkPaths },
    (subject, [fromDir, parts]) => exportPaths(subject, fromDir, parts),
  )

  it.prop(
    '∀s_Support_=Verbatim',
    { of: [Schema.Array(FilePath)], subject: importedSupport },
    (subject, [parts]) => supportFiles(subject, parts),
  )

  it.prop(
    '∀m_Shape_=ImportsSupport',
    { of: [SupportShape], subject: importsSupport },
    (subject, [shape]) => supportLaw(subject, shape),
  )

  it.prop(
    '∀p_KeptPath_=Ignored',
    { of: [Schema.NonEmptyArray(Schema.String)], subject: recordedButTracked },
    (subject, [files]) => keptPathIgnored(subject, files),
  )

  it.prop(
    '∀p_MovedPath_=Reported',
    { of: [Schema.NonEmptyArray(Schema.String)], subject: recordedButTracked },
    (subject, [files]) => movedPathReported(subject, files),
  )

  it.prop(
    '∀p_Untracked_=Ignored',
    { of: [Schema.Array(Schema.String)], subject: recordedButTracked },
    (subject, [files]) => untrackedIgnored(subject, files),
  )

  it.prop(
    '∀r_Pinned_=Graded',
    { of: [InPlaceDraft], subject: judgeInPlace },
    (subject, [draft]) => gradedLaw(subject, draft),
  )

  it.prop(
    '∀r_NoPin_⊥Graded',
    { of: [InPlaceDraft], subject: judgeInPlace },
    (subject, [draft]) => unpinnedLaw(subject, draft),
  )

  it.prop(
    '∀r_WrongCommit_=Pin',
    { of: [InPlaceDraft, Schema.NonEmptyString], subject: judgeInPlace },
    (subject, [draft, suffix]) => commitMismatchLaw(subject, draft, suffix),
  )

  it.prop(
    '∀r_Unrun_=Missing',
    { of: [InPlaceDraft, Schema.Int], subject: judgeInPlace },
    (subject, [draft, drop]) => unrunLaw(subject, draft, drop),
  )

  it.prop(
    '∀m_Trailer_=Pin',
    { of: [Schema.Array(Schema.String), Schema.String], subject: pinnedCommit },
    (subject, [lines, raw]) => pinTrailerLaw(subject, lines, raw),
  )

  it.prop(
    '∀m_Lines_⊥Pin',
    { of: [Schema.Array(Schema.String)], subject: pinnedCommit },
    (subject, [lines]) => pinAbsentLaw(subject, lines),
  )

  it.prop(
    '∀a_Reports_=ReportPaths',
    { of: [Schema.Array(Schema.String)], subject: reportPaths },
    (subject, [parts]) => reportPathsLaw(subject, parts),
  )

  it.prop(
    '∀a_Flags_⊥ReportPaths',
    { of: [Schema.Array(Schema.String), Schema.Array(Schema.String)], subject: reportPaths },
    (subject, [parts, flags]) => reportPathsFlagsLaw(subject, parts, flags),
  )

  it.prop(
    '∀r_Tracked_=Committed',
    { of: [Schema.Array(Schema.String), Schema.Array(Schema.String)], subject: trackedReports },
    (subject, [reports, tracked]) => trackedReportsLaw(subject, reports, tracked),
  )

  const StatusDraft = Schema.Literals(['passed', 'failed', 'skipped', 'pending', 'todo'])
  type StatusDraft = typeof StatusDraft.Type

  const isExecutedStatus = (status: string): boolean => status === 'passed' || status === 'failed'

  /** A one-result report whose empty-named assertion carries exactly `claim`. */
  const claimReport = (claim: string, status: string): VitestReport => ({
    testResults: [{ name: '', assertionResults: [{ status, meta: { upstreamFile: claim } }] }],
  })

  /** A report claiming every file of `draft`, each at `status`. */
  const claimsReportOf = (draft: InPlaceDraft, status: string): VitestReport => ({
    testResults: [{
      name: '',
      assertionResults: subtreeKeys(draft).map((claim) => ({ status, meta: { upstreamFile: claim } })),
    }],
  })

  const claimReportedLaw = (subject: typeof reportedFiles, claim: string, status: string): boolean =>
    HashSet.has(subject(claimReport(claim, status)), claim) === isExecutedStatus(status)

  const claimNamedLaw = (subject: typeof claimedFiles, claim: string, status: string): boolean =>
    subject(claimReport(claim, status)).join('|') === claim

  const strayOnlyLaw = (
    subject: typeof strayClaims,
    claims: readonly string[],
    known: readonly string[],
  ): boolean => {
    const expected = claims.filter((claim) => !known.includes(claim))
    return subject(claims, HashSet.fromIterable(known)).join('|') === expected.join('|')
  }

  const inPlacePathsLaw = (subject: typeof inPlaceClaims, drafts: ReadonlyArray<InPlaceDraft>): boolean => {
    const expected = drafts.flatMap((draft) => subtreeKeys(draft))
    const manifest: Manifest = { reason: 'law', removal: 'law', files: [], inPlace: drafts.map(recordOf) }
    return subject(manifest).join('|') === expected.join('|')
  }

  const claimGradedLaw = (subject: typeof judgeInPlace, draft: InPlaceDraft, status: string): boolean =>
    isGraded(
      subject(
        recordOf(draft),
        Option.some(draft.commit),
        HashSet.fromIterable(subtreeKeys(draft)),
        reportedFiles(claimsReportOf(draft, status)),
      ),
    ) === isExecutedStatus(status)

  it.prop(
    '∀c_RanClaim_=Reported',
    { of: [Schema.NonEmptyString, StatusDraft], subject: reportedFiles },
    (subject, [claim, status]) => claimReportedLaw(subject, claim, status),
  )

  it.prop(
    '∀c_AnyClaim_=Named',
    { of: [Schema.NonEmptyString, StatusDraft], subject: claimedFiles },
    (subject, [claim, status]) => claimNamedLaw(subject, claim, status),
  )

  it.prop(
    '∀c_UnknownClaim_=Stray',
    { of: [Schema.Array(Schema.String), Schema.Array(Schema.String)], subject: strayClaims },
    (subject, [claims, known]) => strayOnlyLaw(subject, claims, known),
  )

  it.prop(
    '∀r_InPlace_=Paths',
    { of: [Schema.Array(InPlaceDraft)], subject: inPlaceClaims },
    (subject, [drafts]) => inPlacePathsLaw(subject, drafts),
  )

  it.prop(
    '∀r_ClaimedRun_=Graded',
    { of: [InPlaceDraft, StatusDraft], subject: judgeInPlace },
    (subject, [draft, status]) => claimGradedLaw(subject, draft, status),
  )
}
