#!/usr/bin/env node
// Generates every stryker.config.json from scripts/stryker-config.source.mjs.
//
//   pnpm generate:stryker-config           write the files
//   pnpm generate:stryker-config --check   report drift, write nothing
//
// The gate (scripts/check-stryker-config.mjs) imports `generateAll` from here,
// so the bytes it compares against are produced by exactly this code path.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { overrides, resolveConfig } from './stryker-config.source.mjs'

const CONFIG_NAME = 'stryker.config.json'

/** Repo root, resolved from git rather than assumed from cwd. */
export const repoRoot = () => execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()

/**
 * Discover configs the way CI sees the repo: tracked files only.
 *
 * The Locked scripts/guard-mutate-scope.mjs globs the working tree and filters
 * node_modules|dist|reports|coverage|repos|.worktrees|.git. Measured 2026-08-05
 * both predicates return the identical 24 paths, and they must keep agreeing --
 * two tools disagreeing about which configs exist is the bug class this whole
 * mechanism was built to close. `assertDiscoveryAgrees` below turns that from a
 * comment into a check.
 */
export const discoverConfigs = (root = repoRoot()) =>
  execFileSync('git', ['ls-files', `**/${CONFIG_NAME}`, CONFIG_NAME], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .sort()

const GUARD_IGNORED = /(^|\/)(node_modules|dist|reports|coverage|repos|\.worktrees|\.git)(\/|$)/

/**
 * Fails when a config exists on disk that `git ls-files` cannot see. Such a
 * file is invisible to CI but live for whoever runs a mutation run locally,
 * which is precisely a config drifting unobserved.
 */
export const assertDiscoveryAgrees = (root = repoRoot(), tracked = discoverConfigs(root)) => {
  const onDisk = fs
    .globSync(`**/${CONFIG_NAME}`, { cwd: root })
    .filter((p) => !GUARD_IGNORED.test(p))
    .sort()
  const untracked = onDisk.filter((p) => !tracked.includes(p))
  const missing = tracked.filter((p) => !onDisk.includes(p))
  return { onDisk, untracked, missing, agrees: untracked.length === 0 && missing.length === 0 }
}

/**
 * Serialize one config. Two-space JSON with a trailing newline is dprint-stable
 * under this repo's `json: {}` settings, so generated output survives
 * `pnpm format:check` without a formatter round-trip -- which matters because
 * the gate compares the generator's in-memory bytes against disk.
 */
export const renderConfig = (packageDir) => `${JSON.stringify(resolveConfig(packageDir), null, 2)}\n`

/** Map of repo-relative config path -> file content. */
export const generateAll = (root = repoRoot(), files = discoverConfigs(root)) =>
  new Map(files.map((file) => [file, renderConfig(path.dirname(file))]))

/** Overrides entries naming a package directory that has no config on disk. */
export const orphanOverrides = (files) => {
  const dirs = new Set(files.map((f) => path.dirname(f)))
  return Object.keys(overrides).filter((dir) => !dirs.has(dir))
}

/**
 * Order-insensitive serialization, so drift is classified by VALUE rather than
 * by key position. Reordering keys is normalization; changing one is a
 * deviation the overrides table has to account for. Collapsing the two would
 * bury real deviations inside formatting churn.
 */
const canonical = (text) => {
  const sort = (v) =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]))
      : v
  return JSON.stringify(sort(JSON.parse(text)))
}

const main = () => {
  const check = process.argv.includes('--check')
  const root = repoRoot()
  const files = discoverConfigs(root)

  if (files.length === 0) {
    console.error('generate-stryker-configs: discovered 0 configs -- refusing to run against an empty set')
    process.exit(1)
  }

  const discovery = assertDiscoveryAgrees(root, files)
  if (!discovery.agrees) {
    for (const p of discovery.untracked) console.error(`  untracked config invisible to CI: ${p}`)
    for (const p of discovery.missing) console.error(`  tracked config missing from disk: ${p}`)
    process.exit(1)
  }

  const orphans = orphanOverrides(files)
  if (orphans.length > 0) {
    for (const dir of orphans) console.error(`  overrides entry for a package with no config: ${dir}`)
    process.exit(1)
  }

  const generated = generateAll(root, files)
  const drifted = []
  const semantic = []

  for (const [file, content] of generated) {
    const abs = path.join(root, file)
    const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null
    if (current === content) continue
    drifted.push(file)
    const same = current !== null && canonical(current) === canonical(content)
    if (!same) semantic.push(file)
    if (!check) fs.writeFileSync(abs, content)
  }

  if (check) {
    if (drifted.length === 0) {
      console.log(`generate-stryker-configs: ${files.length} config(s) match the source`)
      return
    }
    console.error(`generate-stryker-configs: ${drifted.length} config(s) differ from the source`)
    for (const f of drifted) console.error(`  ${semantic.includes(f) ? 'SEMANTIC ' : 'format   '} ${f}`)
    process.exit(1)
  }

  console.log(
    `generate-stryker-configs: ${files.length} config(s); rewrote ${drifted.length}` +
      (semantic.length > 0 ? ` (${semantic.length} with semantic changes)` : ''),
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
