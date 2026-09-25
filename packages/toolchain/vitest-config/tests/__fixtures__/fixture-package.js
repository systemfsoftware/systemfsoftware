/**
 * A fixture package directory: a manifest, the fork linked with its guard, and the files a case names.
 * `defineConfig` reads the working directory, the manifest and the lane when it loads, so a case
 * imports it from inside one of these.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** The fork, whose files the guard is resolved from. */
export const forkPackage = '@systemfsoftware/vitest'

/**
 * @param {string} path
 * @param {string} content
 */
const write = (path, content) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

/**
 * @param {string} name
 * @param {ReadonlyArray<string>} files
 * @returns {string} the fixture package directory
 */
export const fixturePackage = (name, files) => {
  const dir = mkdtempSync(join(tmpdir(), 'vitest-config-'))
  write(join(dir, 'package.json'), JSON.stringify({ name }))
  const fork = join(dir, 'node_modules', forkPackage)
  write(
    join(fork, 'package.json'),
    JSON.stringify({ name: forkPackage, exports: { './guard': { default: './guard.js' } } }),
  )
  write(join(fork, 'guard.js'), '')
  for (const file of files) write(join(dir, file), '')
  return dir
}
