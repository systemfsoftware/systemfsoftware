#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env
const IMPORT_COMMIT = 'df92a9ad3f'
const FAMILY = 'packages/xstate'
const MANIFEST = 'upstream-tests.json'
const TEST_FILE = /\.test\.tsx?$/

const dec = new TextDecoder()

export type ManifestVerdict =
  | { readonly _tag: 'Matches' }
  | { readonly _tag: 'Drifted'; readonly notImported: readonly string[]; readonly unlisted: readonly string[] }

export type Manifest = {
  readonly reason: string
  readonly removal: string
  readonly files: readonly string[]
}

export const expectedFiles = (
  pkgDir: string,
  imported: readonly string[],
  tracked: ReadonlySet<string>,
): readonly string[] =>
  imported
    .filter((path) => path.startsWith(`${pkgDir}/`) && TEST_FILE.test(path) && tracked.has(path))
    .map((path) => path.slice(pkgDir.length + 1))
    .toSorted()

export const judge = (listed: readonly string[], expected: readonly string[]): ManifestVerdict => {
  const want = new Set(expected)
  const have = new Set(listed)
  const notImported = listed.filter((file) => !want.has(file))
  const unlisted = expected.filter((file) => !have.has(file))
  return notImported.length === 0 && unlisted.length === 0
    ? { _tag: 'Matches' }
    : { _tag: 'Drifted', notImported, unlisted }
}

const runGit = async (args: readonly string[]): Promise<string> => {
  const out = await new Deno.Command('git', { args: [...args], stdout: 'piped', stderr: 'piped' }).output()
  if (!out.success) throw new Error(`git ${args.join(' ')} failed: ${dec.decode(out.stderr)}`)
  return dec.decode(out.stdout)
}

const lines = (text: string): readonly string[] => text.split('\n').filter((line) => line.length > 0)

const selftest = (): number => {
  const imported = [
    'packages/xstate/a/test/x.test.ts',
    'packages/xstate/a/src/y.test.tsx',
    'packages/xstate/a/src/y.ts',
  ]
  const tracked = new Set(['packages/xstate/a/test/x.test.ts', 'packages/xstate/a/src/y.ts'])
  const cases: ReadonlyArray<[string, boolean]> = [
    [
      'expected keeps only imported tests still tracked',
      expectedFiles('packages/xstate/a', imported, tracked).join() === 'test/x.test.ts',
    ],
    ['an exact list matches', judge(['test/x.test.ts'], ['test/x.test.ts'])._tag === 'Matches'],
    [
      'a file the import did not bring is refused',
      judge(['test/x.test.ts', 'test/new.test.ts'], ['test/x.test.ts'])._tag === 'Drifted',
    ],
    [
      'a deleted file left in the list is refused',
      judge(['test/x.test.ts', 'src/y.test.tsx'], ['test/x.test.ts'])._tag === 'Drifted',
    ],
    ['an imported file missing from the list is refused', judge([], ['test/x.test.ts'])._tag === 'Drifted'],
  ]
  for (const [name, ok] of cases) console.log(`  ${ok ? '✓' : '✗'} ${name}`)
  const failed = cases.filter(([, ok]) => !ok).length
  console.log(`check-upstream-test-manifest: selftest ${failed === 0 ? 'ok' : 'FAILED'} (${cases.length} tests)`)
  return failed === 0 ? 0 : 1
}

const main = async (write: boolean): Promise<number> => {
  const imported = lines(await runGit(['ls-tree', '-r', '--name-only', IMPORT_COMMIT, '--', FAMILY]))
  const tracked = new Set(lines(await runGit(['ls-files', '--', FAMILY])))
  const manifests = lines(await runGit(['ls-files', '--', `${FAMILY}/*/${MANIFEST}`]))
  const pkgDirs = write
    ? [...new Set(imported.filter((p) => TEST_FILE.test(p)).map((p) => p.split('/').slice(0, 3).join('/')))].toSorted()
    : manifests.map((path) => path.slice(0, -(MANIFEST.length + 1)))
  let failed = 0
  for (const pkgDir of pkgDirs) {
    const expected = expectedFiles(pkgDir, imported, tracked)
    const path = `${pkgDir}/${MANIFEST}`
    if (write) {
      const manifest: Manifest = {
        reason:
          "Upstream statelyai/xstate tests at 2146ae26 register their cases with vitest's own it; they are the oracle and are never edited (plan KTD5, U3).",
        removal: 'Plan U4 (L2) deletes these files and this manifest with the guard exemption entry.',
        files: expected,
      }
      await Deno.writeTextFile(path, `${JSON.stringify(manifest, null, 2)}\n`)
      console.log(`wrote ${path} (${expected.length} files)`)
      continue
    }
    const manifest: Manifest = JSON.parse(await Deno.readTextFile(path))
    const verdict = judge(manifest.files, expected)
    if (verdict._tag === 'Drifted') {
      failed += 1
      console.error(`✗ ${path} drifted from the import commit ${IMPORT_COMMIT}`)
      for (const file of verdict.notImported) {
        console.error(`    not an imported upstream test still in the tree: ${file}`)
      }
      for (const file of verdict.unlisted) console.error(`    imported upstream test missing from the list: ${file}`)
    } else {
      console.log(`✓ ${path}: ${expected.length} verbatim upstream test files`)
    }
  }
  if (failed > 0) {
    console.error(
      'Regenerate with `deno run --config=scripts/deno.jsonc --allow-read --allow-run --allow-write=packages/xstate --allow-env scripts/guards/check-upstream-test-manifest.ts --write`; the list can only shrink.',
    )
  }
  return failed === 0 ? 0 : 1
}

if (import.meta.main) {
  Deno.exit(Deno.args.includes('--selftest') ? selftest() : await main(Deno.args.includes('--write')))
}
