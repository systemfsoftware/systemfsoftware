import { assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { parseAll } from '@std/yaml'

const here = dirname(fromFileUrl(import.meta.url))

// Integrities computed outside the tool: `printf <bytes> | openssl dgst -sha512 -binary | base64`.
const ALPHA = 'sha512-ujzlhmfKmxKzwM3MTaV/mWKuynBlxDp9nAJzMv258LvPaQBChogP49jz/Y8D3f/XSF/ZTJ06OGGOoQaR2Nan+g=='
const BETA = 'sha512-Vgxy3nLApSItkoI39rEFKW2gWYU1NLjQH8I1J8HV2KS4PVsd0/IhBkK9BxzFAFmNTr0pOXPZ9K64rnM2rzqVnQ=='
const GAMMA = 'sha512-gzxjb0OYimcR4dObUlU9oPY8WLGOisekjxkjcsNVji5aBjJRG3giMlHNV3SPf7XsWmvMGDX6ImHoKjaBnGZJ2w=='
// `sha256sum` of the two lines `.sfs-deps/a-1.0.0.tgz <ALPHA>\n.sfs-deps/b-2.0.0.tgz <BETA>\n`.
const KEY_AB = 'sfs-deps-v1-33177f64585f63830a89becd47cf158afab1c87a18d8b7e7f10b876bae1bcd20'
// The same with b's integrity recorded as GAMMA.
const KEY_AB_GAMMA = 'sfs-deps-v1-14961f2efb89117529011636af9f896a08b3edac03f1a62ca1e458dcd1e8175e'

// pnpm 12 writes its own environment as a first document; the workspace's packages are in the second.
const ENV_DOC = `---
lockfileVersion: '9.0'

importers:

  .:
    configDependencies: {}
    packageManagerDependencies:
      pnpm:
        specifier: 12.9.0
        version: 12.9.0

packages:

  pnpm@12.9.0:
    resolution: {integrity: ${GAMMA}}
    hasBin: true

---
`

const tarball = (name: string, version: string, integrity: string) => `
  '@sfs/${name}@file:.sfs-deps/${name}-${version}.tgz':
    resolution: {integrity: ${integrity}, tarball: file:.sfs-deps/${name}-${version}.tgz}
    version: ${version}
`

const lockfile = (entries: readonly string[], importer = '') =>
  `${ENV_DOC}lockfileVersion: '9.0'

importers:

  .:
    devDependencies:${importer}
      left-pad:
        specifier: 1.3.0
        version: 1.3.0

packages:
${entries.join('')}
  left-pad@1.3.0:
    resolution: {integrity: ${GAMMA}}
`

const A = tarball('a', '1.0.0', ALPHA)
const B = tarball('b', '2.0.0', BETA)

// A workspace directory holding `lock` as pnpm-lock.yaml and each named file under .sfs-deps/.
const workspace = async (lock: string | undefined, files: Readonly<Record<string, string>> = {}) => {
  const dir = await Deno.makeTempDir()
  if (lock !== undefined) await Deno.writeTextFile(join(dir, 'pnpm-lock.yaml'), lock)
  await Deno.mkdir(join(dir, '.sfs-deps'))
  for (const [name, text] of Object.entries(files)) await Deno.writeTextFile(join(dir, '.sfs-deps', name), text)
  return dir
}

// Runs the published command the way the composites do, and returns its exit code, output and GITHUB_OUTPUT.
const sfsDeps = async (command: 'key' | 'verify', dir: string) => {
  const outputFile = join(dir, 'github-output')
  await Deno.writeTextFile(outputFile, '')
  const args = [
    'run',
    `--config=${join(here, '..', 'deno.jsonc')}`,
    `--lock=${join(here, '..', 'deno.lock')}`,
    '--frozen',
    '--allow-read',
    '--allow-write',
    '--allow-env',
    join(here, 'sfs-deps.ts'),
    command,
    '--working-directory',
    dir,
  ]
  const out = await new Deno.Command(Deno.execPath(), {
    args,
    env: { GITHUB_OUTPUT: outputFile },
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
  const result = {
    code: out.code,
    stdout: decode(out.stdout),
    stderr: decode(out.stderr),
    output: await Deno.readTextFile(outputFile),
  }
  await Deno.remove(dir, { recursive: true })
  return result
}

Deno.test('a lockfile that names no .sfs-deps tarball gives an empty key', async () => {
  const run = await sfsDeps('key', await workspace(lockfile([])))
  assertEquals(run.code, 0)
  assertEquals(run.output, 'key=\n')
})

Deno.test('the key is the sha256 of the sorted path and integrity lines', async () => {
  const run = await sfsDeps('key', await workspace(lockfile([A, B])))
  assertEquals(run.code, 0)
  assertEquals(run.output, `key=${KEY_AB}\n`)
})

Deno.test('entry order and an alias entry naming the same tarball leave the key unchanged', async () => {
  const alias = `
  '@sfs/a-alias@file:.sfs-deps/a-1.0.0.tgz':
    resolution: {integrity: ${ALPHA}, tarball: file:.sfs-deps/a-1.0.0.tgz}
    version: 1.0.0
`
  const run = await sfsDeps('key', await workspace(lockfile([B, alias, A])))
  assertEquals(run.output, `key=${KEY_AB}\n`)
})

Deno.test('changing one recorded integrity changes the key', async () => {
  const run = await sfsDeps('key', await workspace(lockfile([A, tarball('b', '2.0.0', GAMMA)])))
  assertEquals(run.output, `key=${KEY_AB_GAMMA}\n`)
})

Deno.test('an importer specifier naming the tarball by another relative path does not enter the key', async () => {
  const importer = `
      '@sfs/a':
        specifier: file:../../.sfs-deps/a-1.0.0.tgz
        version: file:.sfs-deps/a-1.0.0.tgz`
  const run = await sfsDeps('key', await workspace(lockfile([A, B], importer)))
  assertEquals(run.output, `key=${KEY_AB}\n`)
})

// The real consumer lockfile: the expected tarballs come from each package id's `@file:.sfs-deps/...` suffix, a
// view of the entry the tool does not read (it reads `resolution.tarball`).
Deno.test("the consumer fixture's key names exactly the tarballs its package ids resolve from .sfs-deps", async () => {
  const lock = await Deno.readTextFile(join(here, '..', '..', '.github', 'consumer-fixture', 'pnpm-lock.yaml'))
  const expected = new Set<string>()
  for (const document of parseAll(lock) as { packages?: Record<string, { resolution?: { integrity?: string } }> }[]) {
    for (const [id, entry] of Object.entries(document?.packages ?? {})) {
      const at = id.indexOf('@file:.sfs-deps/')
      if (at !== -1) expected.add(`${id.slice(at + '@file:'.length)} ${entry.resolution?.integrity}`)
    }
  }
  const run = await sfsDeps('key', await workspace(lock))
  assertEquals(run.code, 0)
  const lines = run.stdout.trimEnd().split('\n')
  assertEquals(lines.slice(0, -1), [...expected].toSorted())
  assertEquals(lines.at(-1)?.endsWith(` tarballs=${expected.size}`), true)
  assertEquals(expected.size > 0, true)
})

Deno.test('one tarball recorded with two integrities refuses the lockfile and names the path', async () => {
  const twin = `
  '@sfs/a-twin@file:.sfs-deps/a-1.0.0.tgz':
    resolution: {integrity: ${BETA}, tarball: file:.sfs-deps/a-1.0.0.tgz}
    version: 1.0.0
`
  const run = await sfsDeps('key', await workspace(lockfile([A, twin])))
  assertEquals(run.code, 1)
  assertStringIncludes(run.stderr, '.sfs-deps/a-1.0.0.tgz')
  assertEquals(run.output, '')
})

Deno.test('a tarball in a subdirectory of .sfs-deps refuses the lockfile and names the resolution', async () => {
  const nested = `
  '@sfs/c@file:.sfs-deps/sub/c-1.0.0.tgz':
    resolution: {integrity: ${ALPHA}, tarball: file:.sfs-deps/sub/c-1.0.0.tgz}
    version: 1.0.0
`
  const run = await sfsDeps('key', await workspace(lockfile([A, nested])))
  assertEquals(run.code, 1)
  assertStringIncludes(run.stderr, 'file:.sfs-deps/sub/c-1.0.0.tgz, not a .tgz directly in .sfs-deps/')
  assertEquals(run.output, '')
})

Deno.test('a tarball recorded with a non-sha512 integrity refuses the lockfile and names the path', async () => {
  const sha1 = 'sha1-2jmj7l5rSw0yVb/vlWAYkK/YBwk='
  const run = await sfsDeps('key', await workspace(lockfile([A, tarball('b', '2.0.0', sha1)])))
  assertEquals(run.code, 1)
  assertStringIncludes(run.stderr, `.sfs-deps/b-2.0.0.tgz has no sha512 integrity in the lockfile (got ${sha1})`)
  assertEquals(run.output, '')
})

Deno.test('a missing lockfile is refused rather than read as needing nothing', async () => {
  const run = await sfsDeps('key', await workspace(undefined))
  assertEquals(run.code, 1)
  assertStringIncludes(run.stderr, 'pnpm-lock.yaml')
  assertEquals(run.output, '')
})

Deno.test('verify passes when every demanded tarball holds the recorded bytes', async () => {
  const run = await sfsDeps(
    'verify',
    await workspace(lockfile([A, B]), { 'a-1.0.0.tgz': 'alpha', 'b-2.0.0.tgz': 'beta' }),
  )
  assertEquals(run.code, 0)
})

Deno.test('verify names exactly the missing tarball', async () => {
  const run = await sfsDeps('verify', await workspace(lockfile([A, B]), { 'b-2.0.0.tgz': 'beta' }))
  assertEquals(run.code, 1)
  assertStringIncludes(run.stderr, 'missing .sfs-deps/a-1.0.0.tgz')
  assertEquals(run.stderr.includes('b-2.0.0.tgz'), false)
})

Deno.test('verify names exactly the tarball whose bytes differ from the lockfile', async () => {
  const run = await sfsDeps(
    'verify',
    await workspace(lockfile([A, B]), { 'a-1.0.0.tgz': 'alpha', 'b-2.0.0.tgz': 'gamma' }),
  )
  assertEquals(run.code, 1)
  assertStringIncludes(run.stderr, `mismatch .sfs-deps/b-2.0.0.tgz: lockfile ${BETA}, built ${GAMMA}`)
  assertEquals(run.stderr.includes('a-1.0.0.tgz'), false)
})

// What a restoring job sees when the cache entry under the lockfile's key holds other bytes: the key still
// matches, so only verify can refuse it.
Deno.test('a tampered tarball restored under the right key is refused by verify', async () => {
  const files = { 'a-1.0.0.tgz': 'tampered', 'b-2.0.0.tgz': 'beta' }
  const keyRun = await sfsDeps('key', await workspace(lockfile([A, B]), files))
  assertEquals(keyRun.output, `key=${KEY_AB}\n`)
  const run = await sfsDeps('verify', await workspace(lockfile([A, B]), files))
  assertEquals(run.code, 1)
  assertStringIncludes(run.stderr, 'mismatch .sfs-deps/a-1.0.0.tgz: lockfile ' + ALPHA)
  assertEquals(run.stderr.includes('b-2.0.0.tgz'), false)
})
