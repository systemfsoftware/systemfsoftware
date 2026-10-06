#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env
const IMPORT_COMMIT = 'df92a9ad3f'
const FAMILY = 'packages/xstate'
const MANIFEST = 'upstream-tests.json'
const DPRINT = 'dprint.json'
const TEST_FILE = /\.test\.tsx?$/
const PORT_BEGIN = '// port:begin '
const PORT_END = '// port:end'

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

export type Manifest = {
  readonly reason: string
  readonly removal: string
  readonly files: readonly string[]
  readonly ported?: readonly Ported[]
  readonly retired?: readonly Retired[]
}

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

const syncFormatterExcludes = async (unformatted: readonly string[], write: boolean): Promise<number> => {
  const config: { excludes: string[] } = JSON.parse(await Deno.readTextFile(DPRINT))
  if (write) {
    config.excludes = [...config.excludes.filter((path) => !path.startsWith(`${FAMILY}/`)), ...unformatted.toSorted()]
    await Deno.writeTextFile(DPRINT, `${JSON.stringify(config, null, 2)}\n`)
    return 0
  }
  const verdict = judge(config.excludes.filter((path) => path.startsWith(`${FAMILY}/`)), unformatted)
  if (verdict._tag === 'Matches') {
    console.log(`✓ ${DPRINT} excludes exactly the ${unformatted.length} verbatim and ported upstream test files`)
    return 0
  }
  console.error(`✗ ${DPRINT} excludes under ${FAMILY} differ from the manifests`)
  for (const file of verdict.extra) console.error(`    excluded but not listed: ${file}`)
  for (const file of verdict.missing) console.error(`    listed but not excluded: ${file}`)
  return 1
}

const main = async (write: boolean): Promise<number> => {
  const imported = lines(await runGit(['ls-tree', '-r', '--name-only', IMPORT_COMMIT, '--', FAMILY]))
  const tracked = new Set(lines(await runGit(['ls-files', '--', FAMILY])))
  const manifests = lines(await runGit(['ls-files', '--', `${FAMILY}/*/${MANIFEST}`]))
  let failed = 0
  const unformatted: string[] = []
  for (const path of manifests) {
    const pkgDir = path.slice(0, -(MANIFEST.length + 1))
    const manifest: Manifest = JSON.parse(await Deno.readTextFile(path))
    const ported = manifest.ported ?? []
    const retired = manifest.retired ?? []
    const recorded = new Set([...ported.map((entry) => entry.upstream), ...retired.map((entry) => entry.upstream)])
    const verbatim = importedTests(pkgDir, imported).filter((file) => !recorded.has(file))
    if (write) {
      await Deno.writeTextFile(path, `${JSON.stringify({ ...manifest, files: verbatim }, null, 2)}\n`)
      console.log(`wrote ${path} (${verbatim.length} verbatim files)`)
    }
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
    unformatted.push(...files.map((file) => `${pkgDir}/${file}`), ...ported.map((entry) => `${pkgDir}/${entry.port}`))
  }
  failed += await syncFormatterExcludes(unformatted, write)
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
