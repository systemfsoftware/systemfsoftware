#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env
const IMPORT_COMMIT = 'df92a9ad3f'
const FAMILY = 'packages/xstate'
const MANIFEST = 'upstream-tests.json'
const DPRINT = 'dprint.json'
const FORMATTER_TEST_GLOB = `${FAMILY}/*/{test,src}/**/*.test.{ts,tsx}`
const FORMATTER_TEST_FILE = new RegExp(`^${FAMILY}/[^/]+/(?:test|src)/.*\\.test\\.tsx?$`)
const FORMATTER_EXCLUDES: readonly string[] = [`${FAMILY}/upstream-tsconfig.json`, FORMATTER_TEST_GLOB]
const TEST_FILE = /\.test\.tsx?$/
const PORT_BEGIN = '// port:begin '
const PORT_END = '// port:end'
const UPSTREAM_TSCONFIG = `${FAMILY}/upstream-tsconfig.json`
const UPSTREAM_TSCONFIG_BLOB = '312be9ed9bed9b6f919671c7efc17edd624db0b4'
const UPSTREAM_TEST_PROJECT = 'tsconfig.upstream-test.json'
const REPO_TEST_PROJECT = 'tsconfig.test.json'
const SOLUTION_PROJECT = 'tsconfig.json'
const SOURCE_CONDITION = '@systemfsoftware/source'

const dec = new TextDecoder()

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
  readonly ported?: readonly Ported[]
  readonly retired?: readonly Retired[]
  readonly typecheck: {
    readonly source: string
    readonly commit: string
    readonly blob: string
    readonly additions: readonly Addition[]
  }
}

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json }

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).toSorted(([a], [b]) => a.localeCompare(b)))
      : inner)

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

const upstreamName = (dir: string): string => dir === 'xstate' ? 'xstate' : `@xstate/${dir.slice('xstate-'.length)}`

/** Maps every upstream specifier a test can import to the fork's source file, from each package's exports. */
export const forkPaths = (
  fromDir: string,
  exportsByDir: Readonly<Record<string, Readonly<Record<string, { readonly [SOURCE_CONDITION]?: string }>>>>,
): Record<string, readonly string[]> =>
  Object.fromEntries(
    Object.entries(exportsByDir).flatMap(([dir, exports]) =>
      Object.entries(exports).flatMap(([subpath, conditions]): ReadonlyArray<readonly [string, readonly string[]]> => {
        const source = conditions[SOURCE_CONDITION]
        if (source === undefined) return []
        const relative = dir === fromDir ? `./${source.slice(2)}` : `../${dir}/${source.slice(2)}`
        return [[`${upstreamName(dir)}${subpath.slice(1)}`, [relative]]]
      })
    ).toSorted(([a], [b]) => a.localeCompare(b)),
  )

export type ListVerdict =
  | { readonly _tag: 'Matches' }
  | { readonly _tag: 'Drifted'; readonly extra: readonly string[]; readonly missing: readonly string[] }

export type PortVerdict =
  | { readonly _tag: 'Faithful' }
  | { readonly _tag: 'Unmarked' }
  | { readonly _tag: 'Changed'; readonly line: number }

export const importedTests = (pkgDir: string, imported: readonly string[]): readonly string[] =>
  imported
    .filter((path) => path.startsWith(`${pkgDir}/`) && TEST_FILE.test(path))
    .map((path) => path.slice(pkgDir.length + 1))
    .toSorted()

export const importedSupport = (pkgDir: string, imported: readonly string[]): readonly string[] =>
  imported
    .filter((path) =>
      path.startsWith(`${pkgDir}/`) &&
      ((/\.tsx?$/.test(path) && !TEST_FILE.test(path) && !path.startsWith(`${pkgDir}/src/`)) ||
        (path.startsWith(`${pkgDir}/src/`) && path.endsWith('.json')))
    )
    .map((path) => path.slice(pkgDir.length + 1))
    .toSorted()

export const judge = (listed: readonly string[], expected: readonly string[]): ListVerdict => {
  const want = new Set(expected)
  const have = new Set(listed)
  const extra = listed.filter((file) => !want.has(file))
  const missing = expected.filter((file) => !have.has(file))
  return extra.length === 0 && missing.length === 0 ? { _tag: 'Matches' } : { _tag: 'Drifted', extra, missing }
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

const runGit = async (args: readonly string[]): Promise<string> => {
  const out = await new Deno.Command('git', { args: [...args], stdout: 'piped', stderr: 'piped' }).output()
  if (!out.success) throw new Error(`git ${args.join(' ')} failed: ${dec.decode(out.stderr)}`)
  return dec.decode(out.stdout)
}

const lines = (text: string): readonly string[] => text.split('\n').filter((line) => line.length > 0)

const selftest = (): number => {
  const up = ['a', 'b', 'c', 'd', 'e']
  const k = [{ case: 'k', lines: [2, 2] as const }]
  const kj = [{ case: 'k', lines: [2, 2] as const }, { case: 'j', lines: [4, 4] as const }]
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
      'the canonical glob holds when it covers every listed file',
      judgeFormatterExcludes(
        [`${FAMILY}/upstream-tsconfig.json`, FORMATTER_TEST_GLOB],
        [`${FAMILY}/upstream-tsconfig.json`, `${FAMILY}/xstate/test/a.test.ts`],
        new Set([`${FAMILY}/xstate/test/a.test.ts`]),
      )._tag === 'Held',
    ],
    [
      'a per-file exclude list is refused',
      judgeFormatterExcludes(
        [`${FAMILY}/xstate/test/a.test.ts`],
        [`${FAMILY}/upstream-tsconfig.json`, `${FAMILY}/xstate/test/a.test.ts`],
        new Set([`${FAMILY}/xstate/test/a.test.ts`]),
      )._tag === 'Broken',
    ],
    [
      'a listed file outside the glob is refused',
      judgeFormatterExcludes(
        [`${FAMILY}/upstream-tsconfig.json`, FORMATTER_TEST_GLOB],
        [`${FAMILY}/xstate/tests/a.test.ts`],
        new Set(),
      )._tag === 'Broken',
    ],
    [
      'a tracked test file the glob covers but the manifest omits is refused',
      judgeFormatterExcludes(
        [`${FAMILY}/upstream-tsconfig.json`, FORMATTER_TEST_GLOB],
        [],
        new Set([`${FAMILY}/xstate/test/a.test.ts`]),
      )._tag === 'Broken',
    ],
  ]
  for (const [name, ok] of cases) console.log(`  ${ok ? '✓' : '✗'} ${name}`)
  const failed = cases.filter(([, ok]) => !ok).length
  console.log(`check-upstream-test-manifest: selftest ${failed === 0 ? 'ok' : 'FAILED'} (${cases.length} tests)`)
  return failed === 0 ? 0 : 1
}

const checkPorts = async (pkgDir: string, ported: readonly Ported[]): Promise<number> => {
  let failed = 0
  for (const entry of ported) {
    const blob = (await runGit(['rev-parse', `${IMPORT_COMMIT}:${pkgDir}/${entry.upstream}`])).trim()
    if (blob !== entry.blob) {
      failed += 1
      console.error(`✗ ${pkgDir}/${entry.port}: pinned upstream blob is ${blob}, the manifest records ${entry.blob}`)
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
        : `✗ ${pkgDir}/${entry.port}:${verdict.line} differs from ${entry.upstream} at the pin outside the ported cases`,
    )
  }
  return failed
}

export type FormatterVerdict =
  | { readonly _tag: 'Held' }
  | {
    readonly _tag: 'Broken'
    readonly patterns: readonly string[]
    readonly missing: readonly string[]
    readonly extra: readonly string[]
  }

/**
 * Holds `${DPRINT}`'s excludes to the manifests. Exactly the two canonical patterns must appear and no
 * other `packages/xstate` exclude may; every listed verbatim and ported file must fall under the glob,
 * and every tracked test file under the glob must be listed. The glob covers upstream's `test/` and
 * `src/` subtrees in one entry, so the excludes cannot drift by the file.
 */
export const judgeFormatterExcludes = (
  excludes: readonly string[],
  unformatted: readonly string[],
  tracked: ReadonlySet<string>,
): FormatterVerdict => {
  const family = excludes.filter((path) => path.startsWith(`${FAMILY}/`))
  const patternsHeld = judge(family, FORMATTER_EXCLUDES)._tag === 'Matches'
  const listed = new Set(unformatted)
  const missing = unformatted.filter((file) => file !== FORMATTER_EXCLUDES[0] && !FORMATTER_TEST_FILE.test(file))
  const extra = [...tracked].filter((file) => FORMATTER_TEST_FILE.test(file) && !listed.has(file))
  return patternsHeld && missing.length === 0 && extra.length === 0
    ? { _tag: 'Held' }
    : { _tag: 'Broken', patterns: family, missing, extra }
}

const syncFormatterExcludes = async (
  unformatted: readonly string[],
  tracked: ReadonlySet<string>,
  write: boolean,
): Promise<number> => {
  const config: { excludes: string[] } = JSON.parse(await Deno.readTextFile(DPRINT))
  if (write) {
    config.excludes = [...config.excludes.filter((path) => !path.startsWith(`${FAMILY}/`)), ...FORMATTER_EXCLUDES]
    await Deno.writeTextFile(DPRINT, `${JSON.stringify(config, null, 2)}\n`)
    return 0
  }
  const verdict = judgeFormatterExcludes(config.excludes, unformatted, tracked)
  if (verdict._tag === 'Held') {
    console.log(`✓ ${DPRINT} excludes the ${unformatted.length - 1} upstream test files through ${FORMATTER_TEST_GLOB}`)
    return 0
  }
  console.error(`✗ ${DPRINT} excludes under ${FAMILY} differ from the manifests`)
  if (verdict.patterns.length > 0) {
    console.error(`    expected ${FORMATTER_EXCLUDES.join(' and ')}, found ${verdict.patterns.join(', ')}`)
  }
  for (const file of verdict.missing) console.error(`    listed but not matched by ${FORMATTER_TEST_GLOB}: ${file}`)
  for (const file of verdict.extra) console.error(`    matched by ${FORMATTER_TEST_GLOB} but not listed: ${file}`)
  return 1
}

type Tsconfig = { readonly compilerOptions?: Readonly<Record<string, Json>>; readonly [key: string]: unknown }

const readJson = async <A>(path: string): Promise<A> => JSON.parse(await Deno.readTextFile(path)) as A

const writeJson = (path: string, value: unknown): Promise<void> =>
  Deno.writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`)

/** One generated JSON file: rewritten under --write, otherwise compared to what the manifest generates. */
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

const checkUpstreamTsconfig = async (): Promise<Readonly<Record<string, Json>> | undefined> => {
  const blob = (await runGit(['hash-object', UPSTREAM_TSCONFIG])).trim()
  if (blob !== UPSTREAM_TSCONFIG_BLOB) {
    console.error(
      `✗ ${UPSTREAM_TSCONFIG} hashes to ${blob}; upstream's tsconfig.json at the pin is ${UPSTREAM_TSCONFIG_BLOB}`,
    )
    return undefined
  }
  const options = (await readJson<Tsconfig>(UPSTREAM_TSCONFIG)).compilerOptions
  return options ?? {}
}

const syncTestProjects = async (
  pkgDir: string,
  manifest: Manifest,
  files: readonly string[],
  projectFiles: readonly string[],
  upstreamOptions: Readonly<Record<string, Json>>,
  exportsByDir: Parameters<typeof forkPaths>[1],
  write: boolean,
): Promise<number> => {
  const dir = pkgDir.slice(FAMILY.length + 1)
  const paths = forkPaths(dir, exportsByDir)
  const recordedPaths = manifest.typecheck.additions.find((addition) => addition.option === 'paths')
  let failed = 0
  if (!write && canonical(recordedPaths?.value) !== canonical(paths)) {
    console.error(`✗ ${pkgDir}/${MANIFEST}: the paths addition differs from the packages' source exports`)
    failed += 1
  }
  const additions = manifest.typecheck.additions.map((addition) =>
    addition.option === 'paths' ? { ...addition, value: paths } : addition
  )
  const references = Object.keys(exportsByDir).map((other) => ({
    path: other === dir ? './tsconfig.app.json' : `../${other}/tsconfig.app.json`,
  }))
  failed += await syncGenerated(
    `${pkgDir}/${UPSTREAM_TEST_PROJECT}`,
    { ...(upstreamTestProject(upstreamOptions, additions, projectFiles) as object), references },
    write,
  )
  const repoTest = await readJson<Record<string, unknown>>(`${pkgDir}/${REPO_TEST_PROJECT}`)
  failed += await syncGenerated(`${pkgDir}/${REPO_TEST_PROJECT}`, { ...repoTest, exclude: [...projectFiles] }, write)
  const solution = await readJson<{ references?: ReadonlyArray<{ path: string }> }>(`${pkgDir}/${SOLUTION_PROJECT}`)
  const solutionRefs = [
    ...(solution.references ?? []).filter((ref) => ref.path !== `./${UPSTREAM_TEST_PROJECT}`),
    { path: `./${UPSTREAM_TEST_PROJECT}` },
  ]
  failed += await syncGenerated(`${pkgDir}/${SOLUTION_PROJECT}`, { ...solution, references: solutionRefs }, write)
  if (write) {
    await writeJson(`${pkgDir}/${MANIFEST}`, { ...manifest, files, typecheck: { ...manifest.typecheck, additions } })
  }
  return failed
}

const main = async (write: boolean): Promise<number> => {
  const imported = lines(await runGit(['ls-tree', '-r', '--name-only', IMPORT_COMMIT, '--', FAMILY]))
  const tracked = new Set(lines(await runGit(['ls-files', '--', FAMILY])))
  const manifests = lines(await runGit(['ls-files', '--', `${FAMILY}/*/${MANIFEST}`]))
  let failed = 0
  const unformatted: string[] = [UPSTREAM_TSCONFIG]
  const upstreamOptions = await checkUpstreamTsconfig()
  if (upstreamOptions === undefined) failed += 1
  const exportsByDir = Object.fromEntries(
    await Promise.all(
      manifests.map(async (path) => {
        const pkgDir = path.slice(0, -(MANIFEST.length + 1))
        const pkg = await readJson<{ exports: Parameters<typeof forkPaths>[1][string] }>(`${pkgDir}/package.json`)
        return [pkgDir.slice(FAMILY.length + 1), pkg.exports] as const
      }),
    ),
  )
  for (const path of manifests) {
    const pkgDir = path.slice(0, -(MANIFEST.length + 1))
    const manifest: Manifest = JSON.parse(await Deno.readTextFile(path))
    const ported = manifest.ported ?? []
    const retired = manifest.retired ?? []
    const recorded = new Set([...ported.map((entry) => entry.upstream), ...retired.map((entry) => entry.upstream)])
    const verbatim = importedTests(pkgDir, imported).filter((file) => !recorded.has(file))
    if (write) console.log(`wrote ${path} (${verbatim.length} verbatim files)`)
    const files = write ? verbatim : manifest.files
    const listVerdict = judge(files, verbatim)
    const untracked = files.filter((file) => !tracked.has(`${pkgDir}/${file}`))
    const recordedButTracked = [...recorded].filter((file) => tracked.has(`${pkgDir}/${file}`))
    if (listVerdict._tag === 'Drifted' || untracked.length > 0 || recordedButTracked.length > 0) {
      failed += 1
      console.error(`✗ ${path} drifted from the import commit ${IMPORT_COMMIT}`)
      if (listVerdict._tag === 'Drifted') {
        for (const file of listVerdict.extra) console.error(`    not an imported upstream test: ${file}`)
        for (const file of listVerdict.missing) console.error(`    imported upstream test with no record: ${file}`)
      }
      for (const file of untracked) console.error(`    listed verbatim but not in the tree: ${file}`)
      for (const file of recordedButTracked) console.error(`    ported or retired but still in the tree: ${file}`)
    } else {
      console.log(`✓ ${path}: ${files.length} verbatim, ${ported.length} ported, ${retired.length} retired`)
    }
    failed += await checkPorts(pkgDir, ported)
    if (upstreamOptions !== undefined) {
      const support = importedSupport(pkgDir, imported).filter((file) => tracked.has(`${pkgDir}/${file}`))
      failed += await syncTestProjects(
        pkgDir,
        manifest,
        files,
        [...files, ...ported.map((entry) => entry.port), ...support].toSorted(),
        upstreamOptions,
        exportsByDir,
        write,
      )
    }
    unformatted.push(...files.map((file) => `${pkgDir}/${file}`), ...ported.map((entry) => `${pkgDir}/${entry.port}`))
  }
  failed += await syncFormatterExcludes(unformatted, tracked, write)
  if (failed > 0) {
    console.error(
      'Regenerate the verbatim lists with `deno run --config=scripts/deno.jsonc --allow-read --allow-run --allow-write=packages/xstate,dprint.json --allow-env scripts/guards/check-upstream-test-manifest.ts --write`.',
    )
  }
  return failed === 0 ? 0 : 1
}

if (import.meta.main) {
  Deno.exit(Deno.args.includes('--selftest') ? selftest() : await main(Deno.args.includes('--write')))
}
