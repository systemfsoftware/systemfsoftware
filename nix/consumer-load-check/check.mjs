// Loads every entry point the toolchain config tarballs publish, from the
// node_modules of a consumer outside the monorepo, the way that consumer would.
//
// The entries come from the installed manifests, never from a list kept here:
// every workspace tarball the consumer depends on except the fork, whose guard
// is checked below, has every `exports` subpath imported and every `bin` run
// with `--help` through its node_modules/.bin shim. Any failure throws and
// exits non-zero.
// Workspace symlinks hide what this sees: Node refuses to strip types from a
// file whose real path is under node_modules, which is only true once installed.
import { spawnSync } from 'node:child_process'
import { access, mkdtemp, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** @param {string} message */
const fail = (message) => {
  throw new Error(`consumer-load-check: ${message}`)
}

const FORK = '@systemfsoftware/vitest'
const consumer = JSON.parse(await readFile('package.json', 'utf8'))
const packages = Object.entries(consumer.dependencies)
  .filter(([name, spec]) => name !== FORK && String(spec).startsWith('file:.sfs-deps/'))
  .map(([name]) => name)
if (packages.length === 0) fail('the consumer depends on no workspace tarball')

/**
 * @param {string} name
 * @param {unknown} bin
 * @returns {string[]}
 */
const binsOf = (name, bin) => {
  if (bin === undefined) return []
  if (typeof bin === 'string') return [name.split('/').at(-1) ?? name]
  return Object.keys(Object(bin))
}

for (const name of packages) {
  const manifest = JSON.parse(await readFile(join('node_modules', name, 'package.json'), 'utf8'))
  if (manifest.private === true) fail(`${name} is installed with "private": true`)

  for (const subpath of Object.keys(manifest.exports ?? {})) {
    const specifier = subpath === '.' ? name : `${name}/${subpath.slice(2)}`
    const loaded = subpath.endsWith('.json')
      ? await import(specifier, { with: { type: 'json' } })
      : await import(specifier)
    console.log(`import ${specifier}: ${Object.keys(loaded).sort().join(', ')}`)
  }

  for (const bin of binsOf(name, manifest.bin)) {
    const run = spawnSync(join('node_modules', '.bin', bin), ['--help'], { encoding: 'utf8' })
    if (run.status !== 0) {
      fail(`bin ${bin} of ${name} exited ${run.status ?? run.signal}\n${run.stdout}${run.stderr}`)
    }
    console.log(`bin ${bin} --help: exit 0`)
  }
}

// tsdown's own config loader must load a tsdown.config.ts that spreads
// quietBuild from this consumer's node_modules, and build with it.
const tsdown = spawnSync(join('node_modules', '.bin', 'tsdown'), ['-l', 'warn'], { encoding: 'utf8' })
if (tsdown.status !== 0) {
  fail(`tsdown -l warn exited ${tsdown.status ?? tsdown.signal}\n${tsdown.stdout}${tsdown.stderr}`)
}
const built = (await readdir('dist')).find((file) => /^index\.m?js$/.test(file))
if (built === undefined) fail(`tsdown -l warn built no index entry: ${(await readdir('dist')).join(', ')}`)
const { answer } = await import(pathToFileURL(resolve('dist', built)).href)
if (answer !== 42) fail(`dist/${built} exports answer ${answer}, expected 42`)
console.log(`tsdown -l warn: built dist/${built} through tsdown.config.ts`)

// vitest-config's `defineConfig` must find the fork's guard in this consumer's
// own node_modules and add it to every test block. The consumer is a pnpm
// workspace root, so the root the fork is given is the one the workspace file
// marks.
await access('pnpm-workspace.yaml')
const { defineConfig } = await import('@systemfsoftware/vitest-config')
const config = await defineConfig({ test: {} })
const guard = await realpath(new URL(import.meta.resolve(`${FORK}/guard`)))
const setupFiles = [config.test?.setupFiles ?? []].flat()
if (!setupFiles.includes(guard)) fail(`defineConfig set setupFiles ${JSON.stringify(setupFiles)}, missing ${guard}`)
console.log(`defineConfig: setupFiles holds ${guard}`)
const root = config.test?.provide?.['@systemfsoftware/vitest:workspace-root']
if (root !== process.cwd()) fail(`defineConfig provided workspace root ${root}, expected ${process.cwd()}`)
console.log(`defineConfig: workspace root ${root}`)

// A package that has not declared the fork is refused at config load, with a
// remedy an outside consumer can follow: the flake tarball or a version range,
// not only the monorepo's `workspace:^`.
const forkLess = await realpath(await mkdtemp(join(tmpdir(), 'fork-less-')))
await writeFile(join(forkLess, 'package.json'), JSON.stringify({ name: 'fork-less-consumer', private: true }))
const consumerDir = process.cwd()
process.chdir(forkLess)
const refusal = await defineConfig({ test: {} }).then(
  () => fail('defineConfig accepted a package with no fork in its node_modules'),
  (/** @type {unknown} */ error) => (error instanceof Error ? error.message : String(error)),
)
process.chdir(consumerDir)
for (
  const expected of [
    `fork-less-consumer has no "${FORK}" linked in its own node_modules`,
    `Add "${FORK}" to devDependencies of ${join(forkLess, 'package.json')}`,
    'otherwise the flake tarball or a version range',
  ]
) {
  if (!refusal.includes(expected)) fail(`defineConfig refusal is missing ${JSON.stringify(expected)}:\n${refusal}`)
}
console.log('defineConfig without the fork: refused, naming the flake tarball or a version range')
