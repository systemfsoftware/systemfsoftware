#!/usr/bin/env node
// `effect-tsgo patch` is not idempotent. It renames whatever sits at the native
// tsc into the next free `tsc.original.N` slot and copies its own binary in,
// never asking whether that binary is already there. Wired into `prepare`, which
// runs on every install, it spent 100 rounds backing up its own output -- 2.9 GB
// of byte-identical 29 MB copies -- until its own >100 counter hard-failed every
// `pnpm install`. Upstream owes the check; until then it lives here.
//
// The target is resolved the way `typescript/lib/getExePath.js` resolves it, so
// this tracks the compiler the toolchain actually runs rather than a second
// guess at the platform package name.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const tsgo = join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'effect-tsgo.cmd' : 'effect-tsgo')

const sha256Of = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

const nativeCompilerPath = () => {
  const require = createRequire(import.meta.url)
  const fromTypescript = createRequire(require.resolve('typescript/package.json'))
  const platformPackage = `@typescript/typescript-${process.platform}-${process.arch}`
  const libDir = join(dirname(fromTypescript.resolve(`${platformPackage}/package.json`)), 'lib')
  return join(libDir, process.platform === 'win32' ? 'tsc.exe' : 'tsc')
}

const target = nativeCompilerPath()
const packaged = execFileSync(tsgo, ['get-exe-path'], { encoding: 'utf8' }).trim()

if (existsSync(target) && sha256Of(target) === sha256Of(packaged)) {
  console.log(`patch-tsgo-if-needed: native tsc already is ${basename(dirname(dirname(packaged)))}, skipping patch`)
} else {
  execFileSync(tsgo, ['patch'], { stdio: 'inherit' })
}
