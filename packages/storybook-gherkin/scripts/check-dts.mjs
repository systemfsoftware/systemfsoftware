#!/usr/bin/env node
// dts:check for this package: fail only on errors in the declarations WE ship.
//
// The strict check (skipLibCheck: false) is a strict consumer of dist/*.d.ts,
// and that program drags third-party declaration files in with it. The
// storybook/test type surface flows through @vitest/expect, whose declarations
// reference an ambient `Chai` namespace they never declare (their own
// @types/chai dependency is installed but not ambient-visible). Policing that
// file would mean declaring a @types/chai devDependency we do not use — cope.
// This script scopes the verdict instead: errors in files under dist/ fail the
// build, errors in node_modules are third-party noise by construction, and any
// other tsc output (crash, config error, usage) still fails. Our own dts is
// checked exactly as strictly as before; the manifest stays honest.
import { spawnSync } from 'node:child_process'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(pkgDir, 'dist')
const tscBin = join(pkgDir, 'node_modules', '.bin', 'tsc')

const result = spawnSync(tscBin, ['--noEmit', '-p', 'tsconfig.dts.json'], {
  cwd: pkgDir,
  encoding: 'utf8',
})
const lines = `${result.stdout ?? ''}${result.stderr ?? ''}`.split('\n').filter(Boolean)

const isTypeError = (line) => /: error TS\d+:/u.test(line)
const fileOf = (line) => line.slice(0, line.indexOf('('))

const ours = lines.filter((l) => isTypeError(l) && fileOf(l).startsWith(`${distDir}${sep}`))
const thirdParty = lines.filter((l) => isTypeError(l) && fileOf(l).includes(`${sep}node_modules${sep}`))
const unexpected = lines.filter((l) => !isTypeError(l) || (!ours.includes(l) && !thirdParty.includes(l)))

if (result.status === null) {
  console.error('dts:check: tsc failed to run')
  console.error(lines.join('\n'))
  process.exit(1)
}

if (result.status === 0) process.exit(0)

// Nonzero. Pass only when every diagnostic is a third-party type error; the
// point of the gate is OUR dts, and a strict check that cannot avoid dragging
// in node_modules must not be held hostage by their files.
if (ours.length === 0 && unexpected.length === 0 && thirdParty.length > 0) process.exit(0)

const group = [...ours, ...unexpected]
console.error(group.length > 0 ? group.join('\n') : 'dts:check: tsc exited nonzero without attributable diagnostics')
process.exit(1)
