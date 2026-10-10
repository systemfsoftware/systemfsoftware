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
import { readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'

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

// vitest-config's `defineConfig` must find the fork's guard in this consumer's
// own node_modules and add it to every test block.
const { defineConfig } = await import('@systemfsoftware/vitest-config')
const config = await defineConfig({ test: {} })
const guard = await realpath(new URL(import.meta.resolve(`${FORK}/guard`)))
const setupFiles = [config.test?.setupFiles ?? []].flat()
if (!setupFiles.includes(guard)) fail(`defineConfig set setupFiles ${JSON.stringify(setupFiles)}, missing ${guard}`)
console.log(`defineConfig: setupFiles holds ${guard}`)
