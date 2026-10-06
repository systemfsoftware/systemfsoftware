#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env
import { dirname, relative } from '@std/path'

const FAMILY_MANIFEST = 'upstream-family.json'
const MANIFEST = 'upstream-tests.json'
const DPRINT = 'dprint.json'
const TEST_FILE = /\.test\.tsx?$/
const PORT_BEGIN = '// port:begin '
const PORT_END = '// port:end'
const UPSTREAM_TEST_PROJECT = 'tsconfig.upstream-test.json'
const REPO_TEST_PROJECT = 'tsconfig.test.json'
const SOLUTION_PROJECT = 'tsconfig.json'
const SOURCE_CONDITION = '@systemfsoftware/source'

const dec = new TextDecoder()
const enc = new TextEncoder()

export type PortRegion = { readonly case: string; readonly lines: readonly [number, number] }

export type Ported = {
  readonly upstream: string
  readonly port: string
  readonly blob: string
  readonly reason: string
  readonly regions: readonly PortRegion[]
}

export type Retired = { readonly upstream: string; readonly reason: string; readonly replacement: string }

export type Addition = { readonly option: string; readonly value: unknown; readonly reason: string }

export type Manifest = {
  readonly reason: string
  readonly removal: string
  readonly files: readonly string[]
  readonly ported?: readonly Ported[] | null
  readonly retired?: readonly Retired[] | null
  readonly typecheck?: { readonly additions: readonly Addition[]; readonly [key: string]: unknown }
  readonly [key: string]: unknown
}

export type FamilyPackage = { readonly upstream: string; readonly specifier?: string }

export type Family = {
  readonly name: string
  readonly reason: string
  readonly source: { readonly ref: string; readonly root: string }
  readonly tests: 'all' | readonly string[]
  readonly packages: Readonly<Record<string, FamilyPackage>>
  readonly typecheck?: { readonly tsconfig: string; readonly blob: string }
}

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json }

type Exports = Readonly<Record<string, { readonly [SOURCE_CONDITION]?: string } | string>>

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).toSorted(([a], [b]) => a.localeCompare(b)))
      : inner)

const join = (base: string, path: string): string => path === '.' ? base : `${base}/${path}`

export const packageDir = (familyDir: string, key: string): string => join(familyDir, key)

export const upstreamDir = (family: Family, key: string): string =>
  join(family.source.root, family.packages[key]?.upstream ?? key)

export const upstreamTestProject = (
  upstreamOptions: Readonly<Record<string, Json>>,
  additions: readonly Addition[],
  files: readonly string[],
): Json => ({
  $schema: 'https://json.schemastore.org/tsconfig',
  compilerOptions: {
    ...upstreamOptions,
    ...Object.fromEntries(additions.map((addition) => [addition.option, addition.value as Json])),
  },
  include: [...files],
})

export const forkPaths = (
  fromDir: string,
  packages: ReadonlyArray<{ readonly dir: string; readonly specifier: string; readonly exports: Exports }>,
): Record<string, readonly string[]> =>
  Object.fromEntries(
    packages.flatMap((pkg) =>
      Object.entries(pkg.exports).flatMap(
        ([subpath, conditions]): ReadonlyArray<readonly [string, readonly string[]]> => {
          const source = typeof conditions === 'string' ? undefined : conditions[SOURCE_CONDITION]
          if (source === undefined) return []
          const target = relative(fromDir, `${pkg.dir}/${source.slice(2)}`)
          return [[`${pkg.specifier}${subpath.slice(1)}`, [target.startsWith('.') ? target : `./${target}`]]]
        },
      )
    ).toSorted(([a], [b]) => a.localeCompare(b)),
  )

export type ListVerdict =
  | { readonly _tag: 'Matches' }
  | { readonly _tag: 'Drifted'; readonly extra: readonly string[]; readonly missing: readonly string[] }

export type PortVerdict =
  | { readonly _tag: 'Faithful' }
  | { readonly _tag: 'Unmarked' }
  | { readonly _tag: 'Changed'; readonly line: number }

export type Selection =
  | { readonly _tag: 'Selected'; readonly tests: readonly string[] }
  | { readonly _tag: 'Absent'; readonly missing: readonly string[] }

export const selectTests = (tests: Family['tests'], upstreamFiles: readonly string[]): Selection => {
  if (tests === 'all') {
    return {
      _tag: 'Selected',
      tests: upstreamFiles.filter((path) => TEST_FILE.test(path)).toSorted(),
    }
  }
  const present = new Set(upstreamFiles)
  const missing = tests.filter((path) => !present.has(path))
  return missing.length === 0 ? { _tag: 'Selected', tests: [...tests].toSorted() } : { _tag: 'Absent', missing }
}

export const importedSupport = (upstreamFiles: readonly string[]): readonly string[] =>
  upstreamFiles
    .filter((path) =>
      (/\.tsx?$/.test(path) && !TEST_FILE.test(path) && !path.startsWith('src/')) ||
      (path.startsWith('src/') && path.endsWith('.json'))
    )
    .toSorted()

export const judge = (listed: readonly string[], expected: readonly string[]): ListVerdict => {
  const want = new Set(expected)
  const have = new Set(listed)
  const extra = listed.filter((file) => !want.has(file))
  const missing = expected.filter((file) => !have.has(file))
  return extra.length === 0 && missing.length === 0 ? { _tag: 'Matches' } : { _tag: 'Drifted', extra, missing }
}

export const differingBlobs = (
  files: readonly string[],
  fork: Readonly<Record<string, string>>,
  upstream: Readonly<Record<string, string>>,
): readonly string[] => files.filter((file) => fork[file] !== upstream[file])

export const unclaimed = (manifests: readonly string[], claimed: readonly string[]): readonly string[] => {
  const owned = new Set(claimed)
  return manifests.filter((path) => !owned.has(path)).toSorted()
}

const firstChange = (upstream: readonly string[], port: readonly string[], at: number): number => {
  const offset = upstream.findIndex((line, index) => port[at + index] !== line)
  return offset < 0 ? -1 : at + offset
}

export const judgePort = (
  upstream: readonly string[],
  port: readonly string[],
  regions: readonly PortRegion[],
): PortVerdict => {
  const marks = port.map((line) => line.trim())
  let up = 0
  let at = 0
  for (const region of regions) {
    const begin = marks.indexOf(`${PORT_BEGIN}${region.case}`, at)
    const end = marks.indexOf(PORT_END, begin)
    if (begin < 0 || end < 0) return { _tag: 'Unmarked' }
    const before = upstream.slice(up, region.lines[0] - 1)
    const changed = firstChange(before, port, at)
    if (changed >= 0 || begin - at !== before.length) {
      return { _tag: 'Changed', line: (changed >= 0 ? changed : at + Math.min(before.length, begin - at)) + 1 }
    }
    up = region.lines[1]
    at = end + 1
  }
  const after = upstream.slice(up)
  const changed = firstChange(after, port, at)
  if (changed >= 0 || port.length - at !== after.length) {
    return { _tag: 'Changed', line: (changed >= 0 ? changed : at + Math.min(after.length, port.length - at)) + 1 }
  }
  return { _tag: 'Faithful' }
}

const runGit = async (args: readonly string[], stdin?: string): Promise<string> => {
  const child = new Deno.Command('git', {
    args: [...args],
    stdin: stdin === undefined ? 'null' : 'piped',
    stdout: 'piped',
    stderr: 'piped',
  }).spawn()
  if (stdin !== undefined) {
    const writer = child.stdin.getWriter()
    await writer.write(enc.encode(stdin))
    await writer.close()
  }
  const out = await child.output()
  if (!out.success) throw new Error(`git ${args.join(' ')} failed: ${dec.decode(out.stderr)}`)
  return dec.decode(out.stdout)
}

const lines = (text: string): readonly string[] => text.split('\n').filter((line) => line.length > 0)

const selftest = (): number => {
  const up = ['a', 'b', 'c', 'd', 'e']
  const k = [{ case: 'k', lines: [2, 2] as const }]
  const kj = [{ case: 'k', lines: [2, 2] as const }, { case: 'j', lines: [4, 4] as const }]
  const family: Family = {
    name: 'f',
    reason: 'r',
    source: { ref: 'HEAD', root: 'repos/up/packages/core' },
    tests: ['test/a.test.ts'],
    packages: { '.': { upstream: '.' }, sub: { upstream: 'packages/sub' } },
  }
  const paths = forkPaths('packages/fam/a', [
    { dir: 'packages/fam/a', specifier: 'a', exports: { '.': { [SOURCE_CONDITION]: './src/index.ts' } } },
    {
      dir: 'packages/fam/b',
      specifier: '@up/b',
      exports: { './x': { [SOURCE_CONDITION]: './src/x.ts' }, './package.json': './package.json' },
    },
  ])
  const cases: ReadonlyArray<[string, boolean]> = [
    ['an exact list matches', judge(['x'], ['x'])._tag === 'Matches'],
    ['a listed file the import did not bring is refused', judge(['x', 'new'], ['x'])._tag === 'Drifted'],
    ['an imported file with no record is refused', judge([], ['x'])._tag === 'Drifted'],
    [
      'a port changed only inside its region is faithful',
      judgePort(up, ['a', '// port:begin k', 'Z', '// port:end', 'c', 'd', 'e'], k)._tag === 'Faithful',
    ],
    [
      'a port changed only inside its two regions is faithful',
      judgePort(up, ['a', '// port:begin k', 'Z', '// port:end', 'c', '// port:begin j', '// port:end', 'e'], kj)
        ._tag === 'Faithful',
    ],
    [
      'a port changed before its region is refused',
      judgePort(up, ['A', '// port:begin k', 'Z', '// port:end', 'c', 'd', 'e'], k)._tag === 'Changed',
    ],
    [
      'a port changed between its regions is refused',
      judgePort(up, ['a', '// port:begin k', '// port:end', 'C', '// port:begin j', '// port:end', 'e'], kj)._tag ===
        'Changed',
    ],
    [
      'a port changed after its region is refused',
      judgePort(up, ['a', '// port:begin k', 'Z', '// port:end', 'c', 'd', 'E'], k)._tag === 'Changed',
    ],
    ['a port without its markers is refused', judgePort(up, ['a', 'Z', 'c', 'd', 'e'], k)._tag === 'Unmarked'],
    [
      "a family that imports all tests selects only the upstream package's test files",
      canonical(selectTests('all', ['src/x.ts', 'test/b.test.ts', 'test/a.test.tsx'])) ===
        canonical({ _tag: 'Selected', tests: ['test/a.test.tsx', 'test/b.test.ts'] }),
    ],
    [
      'a family that lists its tests selects exactly those',
      canonical(selectTests(['test/a.test.ts'], ['test/a.test.ts', 'test/b.test.ts'])) ===
        canonical({ _tag: 'Selected', tests: ['test/a.test.ts'] }),
    ],
    [
      'a listed test upstream no longer has is refused',
      selectTests(['test/gone.test.ts'], ['test/a.test.ts'])._tag === 'Absent',
    ],
    [
      'a single-package family maps "." to its own directory and to the source root',
      packageDir('packages/w', '.') === 'packages/w' && upstreamDir(family, '.') === 'repos/up/packages/core',
    ],
    [
      'a member package maps under its upstream path',
      upstreamDir(family, 'sub') === 'repos/up/packages/core/packages/sub',
    ],
    [
      'a verbatim file whose bytes differ from upstream is refused',
      differingBlobs(['t.test.ts', 'u.test.ts'], { 't.test.ts': 'aa', 'u.test.ts': 'bb' }, {
        't.test.ts': 'aa',
        'u.test.ts': 'cc',
      })
        .join() === 'u.test.ts',
    ],
    [
      'a test manifest no family claims is refused',
      unclaimed(['packages/a/upstream-tests.json', 'packages/b/upstream-tests.json'], [
        'packages/a/upstream-tests.json',
      ])
        .join() === 'packages/b/upstream-tests.json',
    ],
    [
      "specifiers resolve to each package's source export, relative to the importing package",
      canonical(paths) === canonical({ '@up/b/x': ['../b/src/x.ts'], a: ['./src/index.ts'] }),
    ],
  ]
  for (const [name, ok] of cases) console.log(`  ${ok ? '✓' : '✗'} ${name}`)
  const failed = cases.filter(([, ok]) => !ok).length
  console.log(`check-upstream-test-manifest: selftest ${failed === 0 ? 'ok' : 'FAILED'} (${cases.length} tests)`)
  return failed === 0 ? 0 : 1
}

type Tsconfig = { readonly compilerOptions?: Readonly<Record<string, Json>>; readonly [key: string]: unknown }

const readJson = async <A>(path: string): Promise<A> => JSON.parse(await Deno.readTextFile(path)) as A

const writeJson = (path: string, value: unknown): Promise<void> =>
  Deno.writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`)

const syncGenerated = async (path: string, expected: unknown, write: boolean): Promise<number> => {
  if (write) {
    await writeJson(path, expected)
    return 0
  }
  const actual = await readJson<unknown>(path).catch(() => undefined)
  if (canonical(actual) === canonical(expected)) return 0
  console.error(`✗ ${path} differs from what the manifest generates`)
  return 1
}

const upstreamBlobs = async (ref: string, dir: string): Promise<Record<string, string>> =>
  Object.fromEntries(
    lines(await runGit(['ls-tree', '-r', ref, '--', `${dir}/`])).map((line) => {
      const [meta = '', path = ''] = line.split('\t')
      return [path.slice(dir.length + 1), meta.split(' ')[2] ?? '']
    }),
  )

const worktreeBlobs = async (dir: string, files: readonly string[]): Promise<Record<string, string>> => {
  const present: string[] = []
  for (const file of files) {
    const exists = await Deno.stat(`${dir}/${file}`).then(() => true, () => false)
    if (exists) present.push(file)
  }
  if (present.length === 0) return {}
  const hashes = lines(
    await runGit(['hash-object', '--stdin-paths'], `${present.map((file) => `${dir}/${file}`).join('\n')}\n`),
  )
  return Object.fromEntries(present.map((file, index) => [file, hashes[index] ?? '']))
}

const checkPorts = async (
  pkgDir: string,
  upBlobs: Readonly<Record<string, string>>,
  ported: readonly Ported[],
): Promise<number> => {
  let failed = 0
  for (const entry of ported) {
    const blob = upBlobs[entry.upstream]
    if (blob !== entry.blob) {
      failed += 1
      console.error(
        `✗ ${pkgDir}/${entry.port}: upstream's ${entry.upstream} is ${
          blob ?? 'absent'
        } at the family's source, the manifest records ${entry.blob}`,
      )
      continue
    }
    const upstream = (await runGit(['cat-file', 'blob', blob])).split('\n')
    const port = (await Deno.readTextFile(`${pkgDir}/${entry.port}`)).split('\n')
    const verdict = judgePort(upstream, port, entry.regions)
    if (verdict._tag === 'Faithful') continue
    failed += 1
    console.error(
      verdict._tag === 'Unmarked'
        ? `✗ ${pkgDir}/${entry.port}: a region of ${
          entry.regions.map((region) => region.case).join(', ')
        } lacks its "${PORT_BEGIN}<case>" ... "${PORT_END}" markers`
        : `✗ ${pkgDir}/${entry.port}:${verdict.line} differs from upstream's ${entry.upstream} outside the ported cases`,
    )
  }
  return failed
}

const syncFormatterExcludes = async (
  roots: readonly string[],
  unformatted: readonly string[],
  write: boolean,
): Promise<number> => {
  const config: { excludes: string[] } = JSON.parse(await Deno.readTextFile(DPRINT))
  const owned = (path: string): boolean => roots.some((root) => path.startsWith(`${root}/`))
  if (write) {
    config.excludes = [...config.excludes.filter((path) => !owned(path)), ...unformatted.toSorted()]
    await Deno.writeTextFile(DPRINT, `${JSON.stringify(config, null, 2)}\n`)
    return 0
  }
  const verdict = judge(config.excludes.filter(owned), unformatted)
  if (verdict._tag === 'Matches') {
    console.log(`✓ ${DPRINT} excludes exactly the ${unformatted.length} verbatim and ported upstream test files`)
    return 0
  }
  console.error(`✗ ${DPRINT} excludes under the upstream families differ from their manifests`)
  for (const file of verdict.extra) console.error(`    excluded but not listed: ${file}`)
  for (const file of verdict.missing) console.error(`    listed but not excluded: ${file}`)
  return 1
}

const checkUpstreamTsconfig = async (
  familyDir: string,
  typecheck: NonNullable<Family['typecheck']>,
): Promise<Readonly<Record<string, Json>> | undefined> => {
  const path = `${familyDir}/${typecheck.tsconfig}`
  const blob = (await runGit(['hash-object', path])).trim()
  if (blob !== typecheck.blob) {
    console.error(`✗ ${path} hashes to ${blob}; the family records upstream's tsconfig as ${typecheck.blob}`)
    return undefined
  }
  return (await readJson<Tsconfig>(path)).compilerOptions ?? {}
}

type Member = { readonly key: string; readonly dir: string; readonly specifier: string; readonly exports: Exports }

const syncTestProjects = async (
  member: Member,
  members: readonly Member[],
  manifest: Manifest,
  files: readonly string[],
  projectFiles: readonly string[],
  upstreamOptions: Readonly<Record<string, Json>>,
  write: boolean,
): Promise<number> => {
  const paths = forkPaths(member.dir, members)
  const additions = manifest.typecheck?.additions ?? []
  const recordedPaths = additions.find((addition) => addition.option === 'paths')
  let failed = 0
  if (!write && canonical(recordedPaths?.value) !== canonical(paths)) {
    console.error(`✗ ${member.dir}/${MANIFEST}: the paths addition differs from the packages' source exports`)
    failed += 1
  }
  const generated = additions.map((addition) => addition.option === 'paths' ? { ...addition, value: paths } : addition)
  const references = members.map((other) => `${other.dir}/`).toSorted().map((dir) => ({
    path: dir === `${member.dir}/` ? './tsconfig.app.json' : `${relative(member.dir, dir)}/tsconfig.app.json`,
  }))
  failed += await syncGenerated(
    `${member.dir}/${UPSTREAM_TEST_PROJECT}`,
    { ...(upstreamTestProject(upstreamOptions, generated, projectFiles) as object), references },
    write,
  )
  const repoTest = await readJson<Record<string, unknown>>(`${member.dir}/${REPO_TEST_PROJECT}`)
  failed += await syncGenerated(
    `${member.dir}/${REPO_TEST_PROJECT}`,
    { ...repoTest, exclude: [...projectFiles] },
    write,
  )
  const solution = await readJson<{ references?: ReadonlyArray<{ path: string }> }>(`${member.dir}/${SOLUTION_PROJECT}`)
  const solutionRefs = [
    ...(solution.references ?? []).filter((ref) => ref.path !== `./${UPSTREAM_TEST_PROJECT}`),
    { path: `./${UPSTREAM_TEST_PROJECT}` },
  ]
  failed += await syncGenerated(`${member.dir}/${SOLUTION_PROJECT}`, { ...solution, references: solutionRefs }, write)
  if (write) {
    await writeJson(`${member.dir}/${MANIFEST}`, {
      ...manifest,
      files,
      typecheck: { ...manifest.typecheck, additions: generated },
    })
  }
  return failed
}

type FamilyResult = {
  readonly failed: number
  readonly unformatted: readonly string[]
  readonly claimed: readonly string[]
}

const checkFamily = async (familyPath: string, tracked: ReadonlySet<string>, write: boolean): Promise<FamilyResult> => {
  const familyDir = dirname(familyPath)
  const family = await readJson<Family>(familyPath)
  let failed = 0
  const unformatted: string[] = []
  const upstreamOptions = family.typecheck === undefined
    ? undefined
    : await checkUpstreamTsconfig(familyDir, family.typecheck)
  if (family.typecheck !== undefined) {
    unformatted.push(`${familyDir}/${family.typecheck.tsconfig}`)
    if (upstreamOptions === undefined) failed += 1
  }
  const members: Member[] = await Promise.all(
    Object.entries(family.packages).map(async ([key, pkg]) => {
      const dir = packageDir(familyDir, key)
      const manifest = await readJson<{ name: string; exports?: Exports }>(`${dir}/package.json`).catch(() => undefined)
      return { key, dir, specifier: pkg.specifier ?? manifest?.name ?? key, exports: manifest?.exports ?? {} }
    }),
  )
  for (const member of members) {
    const path = `${member.dir}/${MANIFEST}`
    if (!tracked.has(path)) {
      failed += 1
      console.error(`✗ ${familyPath}: package ${member.key} has no tracked ${path}`)
      continue
    }
    const manifest = await readJson<Manifest>(path)
    const ported = manifest.ported ?? []
    const retired = manifest.retired ?? []
    const upBlobs = await upstreamBlobs(family.source.ref, upstreamDir(family, member.key))
    const selection = selectTests(family.tests, Object.keys(upBlobs))
    if (selection._tag === 'Absent') {
      failed += 1
      console.error(
        `✗ ${familyPath}: listed tests are absent upstream at ${family.source.ref}: ${selection.missing.join(', ')}`,
      )
      continue
    }
    const recorded = new Set([...ported.map((entry) => entry.upstream), ...retired.map((entry) => entry.upstream)])
    const verbatim = selection.tests.filter((file) => !recorded.has(file))
    if (write) console.log(`wrote ${path} (${verbatim.length} verbatim files)`)
    const files = write ? verbatim : manifest.files
    const listVerdict = judge(files, verbatim)
    const untracked = files.filter((file) => !tracked.has(`${member.dir}/${file}`))
    const portPaths = new Set(ported.map((entry) => entry.port))
    const recordedButTracked = [...recorded].filter((file) =>
      !portPaths.has(file) && tracked.has(`${member.dir}/${file}`)
    )
    const altered = differingBlobs(files, await worktreeBlobs(member.dir, files), upBlobs)
      .filter((file) => !untracked.includes(file))
    if (listVerdict._tag === 'Drifted' || untracked.length + recordedButTracked.length + altered.length > 0) {
      failed += 1
      console.error(`✗ ${path} drifted from upstream at ${family.source.ref}:${upstreamDir(family, member.key)}`)
      if (listVerdict._tag === 'Drifted') {
        for (const file of listVerdict.extra) console.error(`    not an imported upstream test: ${file}`)
        for (const file of listVerdict.missing) console.error(`    imported upstream test with no record: ${file}`)
      }
      for (const file of untracked) console.error(`    listed verbatim but not in the tree: ${file}`)
      for (const file of recordedButTracked) console.error(`    ported or retired but still in the tree: ${file}`)
      for (const file of altered) console.error(`    listed verbatim but its bytes differ from upstream: ${file}`)
    } else {
      console.log(`✓ ${path}: ${files.length} verbatim, ${ported.length} ported, ${retired.length} retired`)
    }
    failed += await checkPorts(member.dir, upBlobs, ported)
    if (upstreamOptions !== undefined) {
      const support = importedSupport(Object.keys(upBlobs)).filter((file) => tracked.has(`${member.dir}/${file}`))
      failed += await syncTestProjects(
        member,
        members,
        manifest,
        files,
        [...files, ...ported.map((entry) => entry.port), ...support].toSorted(),
        upstreamOptions,
        write,
      )
    }
    unformatted.push(
      ...files.map((file) => `${member.dir}/${file}`),
      ...ported.map((entry) => `${member.dir}/${entry.port}`),
    )
  }
  return { failed, unformatted, claimed: members.map((member) => `${member.dir}/${MANIFEST}`) }
}

const main = async (write: boolean): Promise<number> => {
  const tracked = new Set(lines(await runGit(['ls-files'])))
  const outsideVendor = (path: string): boolean => !path.startsWith('repos/')
  const families = [...tracked].filter((path) => outsideVendor(path) && path.split('/').at(-1) === FAMILY_MANIFEST)
    .toSorted()
  const manifests = [...tracked].filter((path) => outsideVendor(path) && path.split('/').at(-1) === MANIFEST).toSorted()
  let failed = 0
  const unformatted: string[] = []
  const claimed: string[] = []
  for (const familyPath of families) {
    const result = await checkFamily(familyPath, tracked, write)
    failed += result.failed
    unformatted.push(...result.unformatted)
    claimed.push(...result.claimed)
  }
  const orphans = unclaimed(manifests, claimed)
  if (orphans.length > 0) {
    failed += 1
    console.error(`✗ ${orphans.length} ${MANIFEST} file(s) belong to no ${FAMILY_MANIFEST}, so nothing checks them:`)
    for (const path of orphans) console.error(`    ${path}`)
  }
  failed += await syncFormatterExcludes(families.map(dirname), unformatted, write)
  if (failed > 0) {
    console.error(
      'Regenerate the verbatim lists with `deno run --config=scripts/deno.jsonc --allow-read --allow-run --allow-write=packages,dprint.json --allow-env scripts/guards/check-upstream-test-manifest.ts --write`.',
    )
  } else {
    console.log(
      `✓ ${families.length} upstream test famil${families.length === 1 ? 'y' : 'ies'}, ${claimed.length} manifest(s)`,
    )
  }
  return failed === 0 ? 0 : 1
}

if (import.meta.main) {
  Deno.exit(Deno.args.includes('--selftest') ? selftest() : await main(Deno.args.includes('--write')))
}
