/// <reference types="vitest/importMeta" />
import { HashSet, Match, Option, Schema } from 'effect'
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

/**
 * The in-source property laws for this module's 25 pure rows. Each law relates a
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
}
