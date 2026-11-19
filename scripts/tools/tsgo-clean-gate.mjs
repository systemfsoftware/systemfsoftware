#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const bin = (name) => join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name)
const tscBin = bin('tsc')
const tsgoBin = bin('effect-tsgo')

const ENROLLED = [
  'packages/sim/effect-sim-kernel',
  'packages/sim/effect-sim-kernel-tests',
]

const sha256Of = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

const nativeCompilerPath = () => {
  const require = createRequire(join(repoRoot, 'package.json'))
  const fromTypescript = createRequire(require.resolve('typescript/package.json'))
  const platformPackage = `@typescript/typescript-${process.platform}-${process.arch}`
  const libDir = join(dirname(fromTypescript.resolve(`${platformPackage}/package.json`)), 'lib')
  return join(libDir, process.platform === 'win32' ? 'tsc.exe' : 'tsc')
}

const tscIsPatched = () => {
  const target = nativeCompilerPath()
  if (!existsSync(target)) return false
  const packaged = execFileSync(tsgoBin, ['get-exe-path'], { encoding: 'utf8' }).trim()
  return sha256Of(target) === sha256Of(packaged)
}

const run = (command, args) => {
  execFileSync(command, args, { stdio: 'inherit', cwd: repoRoot })
}

const checkPackage = (dir) => {
  try {
    execFileSync(tscBin, ['-b', '--force'], { cwd: join(repoRoot, dir), stdio: 'pipe' })
    console.log(`tsgo-clean: ${dir} clean`)
    return true
  } catch (error) {
    const output = error instanceof Error && 'stdout' in error
      ? `${String(error.stdout)}${String(error.stderr)}`
      : String(error)
    console.error(`tsgo-clean: ${dir} FAILED under the patched compiler\n${output}`)
    return false
  }
}

const wasPatched = tscIsPatched()
const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ENROLLED

try {
  run(process.execPath, [join(repoRoot, 'scripts', 'tools', 'patch-tsgo-if-needed.mjs')])
  const clean = targets.map(checkPackage).every(Boolean)
  if (!clean) process.exitCode = 1
} finally {
  if (!wasPatched && tscIsPatched()) {
    run(tsgoBin, ['unpatch'])
    console.log('tsgo-clean: restored the unpatched compiler')
  }
}
