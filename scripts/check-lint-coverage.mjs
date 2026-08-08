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
//
// Keys are EXACT package directories, never path prefixes. A prefix silently adopts
// every package created beneath it later, which is how `packages/stryker-js/cli` — a
// package authored for full cell compliance — inherited the fork's exemption and shipped
// with every cell rule absent. A new package must now be classified deliberately: the
// gate fails until someone either enrols it or adds a line here with a reason.
const TOOLING = new Map([
  // The lint rules themselves; declaring oxlint-config would close a CO4 dependency cycle.
  ...[
    'cell-imports',
    'cell-taxonomy',
    'core',
    'effect-acl',
    'effect-adapter',
    'effect-dmmf',
    'effect-entrypoint',
    'effect-executor',
    'effect-handler',
    'effect-kernel',
    'effect-middleware',
    'effect-observer',
    'effect-policy',
    'effect-schema',
    'effect-shape',
    'effect-state',
    'effect-store',
    'effect-workflow',
    'property-testing',
    'recommended',
    'test-hygiene',
    'test-placement',
  ].map((name) => [
    `packages/oxlint-plugins/${name}`,
    'lint rules themselves; declaring oxlint-config closes a CO4 dependency cycle',
  ]),
  ['packages/oxlint-config', 'the config package; cannot extend itself'],

  // Our Stryker fork. Enumerated one package at a time: `packages/stryker-js/cli` is NOT
  // here, because we authored it and chartered it for full cell compliance.
  ...['mutation-run', 'typescript-checker', 'vitest-runner'].map((name) => [
    `packages/stryker-js/${name}`,
    'our Stryker fork: upstream-shaped, not Effect cell code, so cell rules are the wrong observer; carries its own oxlint baseline and mutation gate',
  ]),
  ...[
    'packages/stryker-js/typescript-checker/testResources/nodenext-project',
    'packages/stryker-js/vitest-runner/testResources/async-failure',
    'packages/stryker-js/vitest-runner/testResources/multiple-files',
  ].map((dir) => [dir, 'test fixture project consumed by a runner suite, not product code']),

  ...['atom', 'atom-react'].map((name) => [
    `packages/effect-atom/${name}`,
    'vendored effect-atom fork: upstream-shaped library code, not Effect cell code; carries its own oxlint baseline',
  ]),
  [
    'packages/storybook-gherkin',
    'vendored storybook-gherkin DSL: upstream-shaped library code, not Effect cell code; carries its own oxlint baseline',
  ],
  ['packages/stryker-plugins', 'mutation tooling, not shipped product code'],
  ...['cli', 'core'].map((name) => [`packages/arethetypeswrong/${name}`, 'port of arethetypeswrong, tooling']),
])

// The one sanctioned prefix. Vendored trees are read-only (REPO-S3), so we never author a
// package beneath them and silent adoption is the correct behaviour there.
const VENDORED = 'vendored upstream, read-only (REPO-S3)'

const toolingReason = (dir) => TOOLING.get(dir) ?? (dir.startsWith('repos/') ? VENDORED : undefined)

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
