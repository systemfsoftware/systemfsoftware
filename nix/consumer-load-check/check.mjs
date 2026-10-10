// Loads every entry point the toolchain config tarballs publish, from the
// node_modules of a consumer outside the monorepo, the way that consumer would.
//
// The entries come from each installed manifest, never from a list kept here:
// every `exports` subpath is imported and every `bin` is run with `--help`
// through its node_modules/.bin shim. Any failure throws and exits non-zero.
// Workspace symlinks hide what this sees: Node refuses to strip types from a
// file whose real path is under node_modules, which is only true once installed.
import { spawnSync } from 'node:child_process'
import { readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGES = ['@systemfsoftware/tsdown-config', '@systemfsoftware/vitest-config', '@systemfsoftware/stryker-config']

/** @param {string} message */
const fail = (message) => {
  throw new Error(`consumer-load-check: ${message}`)
}

/**
 * @param {string} name
 * @param {unknown} bin
 * @returns {Array<[string, string]>}
 */
const binsOf = (name, bin) => {
  if (bin === undefined) return []
  if (typeof bin === 'string') return [[name.split('/').at(-1) ?? name, bin]]
  return Object.entries(Object(bin))
}

for (const name of PACKAGES) {
  const manifest = JSON.parse(await readFile(join('node_modules', name, 'package.json'), 'utf8'))
  if (manifest.private === true) fail(`${name} is installed with "private": true`)

  for (const subpath of Object.keys(manifest.exports ?? {})) {
    const specifier = subpath === '.' ? name : `${name}/${subpath.slice(2)}`
    const loaded = subpath.endsWith('.json')
      ? await import(specifier, { with: { type: 'json' } })
      : await import(specifier)
    console.log(`import ${specifier}: ${Object.keys(loaded).sort().join(', ')}`)
  }

  for (const [bin] of binsOf(name, manifest.bin)) {
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
const guard = await realpath(fileURLToPath(import.meta.resolve('@systemfsoftware/vitest/guard')))
const setupFiles = [config.test?.setupFiles ?? []].flat()
if (!setupFiles.includes(guard)) fail(`defineConfig set setupFiles ${JSON.stringify(setupFiles)}, missing ${guard}`)
console.log(`defineConfig: setupFiles holds ${guard}`)
