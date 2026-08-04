#!/usr/bin/env node
// LOCKED SURFACE (AGENTS.md Surface Classes).
// Never edit this file to make a coverage failure pass; opt the package in instead.
//
// Answers one question: does every package holding production source actually get
// linted by the cell rules? A rule registered in @systemfsoftware/oxlint-config reaches
// ONLY packages whose own oxlint.config.ts extends it. Registration is not delivery.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const root = process.cwd()

// Tooling is NOT production. This list is the boundary — it exists because the
// distinction is not derivable: tooling packages are published too, so `private` does
// not discriminate (measured 2026-08-01: 26 false positives).
// Every entry states why the package is exempt. An entry without a reason is a bug.
const TOOLING = [
  ['packages/oxlint-plugins/', 'lint rules themselves; declaring oxlint-config closes a CO4 dependency cycle'],
  ['packages/oxlint-config/', 'the config package; cannot extend itself'],
  [
    'packages/stryker-js/',
    'our Stryker fork: not Effect cell code, so cell rules are the wrong observer; carries its own oxlint baseline and mutation gate',
  ],
  ['packages/stryker-plugins/', 'mutation tooling, not shipped product code'],
  ['packages/arethetypeswrong/', 'port of arethetypeswrong, tooling'],
  ['packages/tsconfig/', 'shared tsconfig, no runtime source'],
  ['packages/vitest-config/', 'shared vitest config, no runtime source'],
  ['repos/', 'vendored upstream, read-only (REPO-S3)'],
]

const toolingReason = (dir) => TOOLING.find(([prefix]) => `${dir}/`.startsWith(prefix))?.[1]

const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n')
  .filter(Boolean)

const manifests = tracked.filter((f) =>
  f.endsWith('package.json') && !f.includes('node_modules') && f !== 'package.json'
)
const packageDirs = manifests.map(dirname)

const ownerOf = (file) => {
  const parts = file.split('/')
  for (let i = parts.length - 1; i > 0; i--) {
    const dir = parts.slice(0, i).join('/')
    if (packageDirs.includes(dir)) return dir
  }
  return null
}

const sourceBearing = new Set()
for (const file of tracked) {
  if (!file.endsWith('.ts') || !file.includes('/src/')) continue
  if (/\.(test|spec)\.ts$/.test(file)) continue
  const owner = ownerOf(file)
  if (owner !== null) sourceBearing.add(owner)
}

const optsIn = (dir) => {
  const config = join(root, dir, 'oxlint.config.ts')
  return existsSync(config) && readFileSync(config, 'utf8').includes('@systemfsoftware/oxlint-config')
}

const uncovered = []
let production = 0
let exempt = 0

for (const dir of [...sourceBearing].sort()) {
  if (toolingReason(dir) !== undefined) {
    exempt++
    continue
  }
  production++
  if (!optsIn(dir)) uncovered.push(dir)
}

if (uncovered.length > 0) {
  console.error(
    `check-lint-coverage: ${uncovered.length} production package(s) hold src/ TypeScript but do NOT extend @systemfsoftware/oxlint-config, so every cell rule is silently absent there:\n`,
  )
  for (const dir of uncovered) console.error(`  ${dir}`)
  console.error(
    `\nFix: add ${
      uncovered[0]
    }/oxlint.config.ts extending '@systemfsoftware/oxlint-config/base' and declare the devDependency.`,
  )
  console.error(`If the package is tooling rather than product code, add it to TOOLING in this file WITH a reason.`)
  process.exit(1)
}

console.log(`check-lint-coverage: ${production} production package(s) linted, ${exempt} tooling package(s) exempt`)
