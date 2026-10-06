import { HashSet, Match, Option } from 'effect'
import { dual } from 'effect/Function'

import {
  type Addition,
  type Exports,
  type ExportsEntry,
  type Family,
  type FamilyPackage,
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

const ranToCompletion = (result: VitestReport['testResults'][number]): boolean =>
  result.assertionResults.some((assertion) => ran(assertion.status))

/** Every test file the vitest JSON report shows collected and executed. */
export const reportedFiles = (report: VitestReport): HashSet.HashSet<string> =>
  HashSet.fromIterable(report.testResults.filter(ranToCompletion).map((result) => result.name))

const namedBy = (subtree: string, file: string) => (name: string): boolean => name.endsWith(`${subtree}/${file}`)

const isReported = (subtree: string, file: string, reported: HashSet.HashSet<string>): boolean =>
  [...reported].some(namedBy(subtree, file))

/** The in-place files the report does not show collected and executed. */
export const unreportedFiles = dual<
  (subtree: string, files: readonly string[]) => (reported: HashSet.HashSet<string>) => readonly string[],
  (subtree: string, files: readonly string[], reported: HashSet.HashSet<string>) => readonly string[]
>(3, (subtree, files, reported) => files.filter((file) => !isReported(subtree, file, reported)))

/** Every file an in-place record executes, across all of a member's records. */
export const inPlaceFiles = (manifest: Manifest): readonly string[] =>
  (manifest.inPlace ?? []).flatMap((record) => record.files)

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
