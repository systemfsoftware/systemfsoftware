#!/usr/bin/env node
// api-extractor-quiet.js — run API Extractor with its success chatter dropped.
//
// API Extractor has no quiet mode: `run` always prints a version banner, the
// config path it guessed, the TypeScript engine it picked, and a "completed
// successfully" footer. Across 30 packages that is ~150 log lines per cold
// build carrying no information — the only facts that matter are the
// diagnostics and the exit code.
//
// This runs whatever `api-extractor` the calling package resolved (its own
// node_modules/.bin, so the pinned version is unchanged), forwards stderr
// untouched, and drops exactly the known-success lines from stdout. Any other
// line — warnings, errors, the "completed with warnings/errors" footer — is
// printed verbatim. On a non-zero exit the full output is printed instead, so a
// failure is never filtered into silence.
//
// It ships as a package `bin`, so pnpm links it into every consumer's
// node_modules/.bin and the package scripts call it by name. The pnpm shim
// execs `node <this file>`, which is why it is plain JavaScript with no Deno
// APIs and no dependencies: Node refuses to strip types from a file under
// node_modules, so a TypeScript bin would fail for every installed consumer.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const EXE = process.platform === 'win32' ? 'api-extractor.cmd' : 'api-extractor'

/**
 * Lines API Extractor prints on every successful run, and only on success.
 * @type {readonly RegExp[]}
 */
const SUCCESS_LINES = [
  /^api-extractor\s+\d+\.\d+\.\d+.*api-extractor\.com\/?$/u,
  /^Using configuration from .+$/u,
  /^Analysis will use the bundled TypeScript version .+$/u,
  /^API Extractor completed successfully$/u,
]

/**
 * Strip SGR color codes so a colored banner still matches its pattern.
 * @param {string} line
 */
const stripAnsi = (line) => line.replaceAll(/\u001B\[[0-9;]*m/gu, '')

/**
 * Walk up from `start` looking for the package-local binary shim.
 * @param {string} start
 * @returns {string | null}
 */
const resolveReal = (start) => {
  let dir = start
  while (true) {
    const candidate = join(dir, 'node_modules', '.bin', EXE)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

// The calling package is where `api:check` runs, so that is where its pinned
// `api-extractor` lives: pnpm links it into the package's own node_modules.
const real = resolveReal(process.cwd())

if (real === null) {
  console.error(
    `api-extractor-quiet: no ${EXE} found from ${process.cwd()} upward; ` +
      'the package must depend on @microsoft/api-extractor',
  )
  process.exit(1)
}

const result = spawnSync(real, process.argv.slice(2), {
  encoding: 'utf8',
  stdio: ['inherit', 'pipe', 'inherit'],
  env: { ...process.env, PATH: `${dirname(real)}:${process.env['PATH'] ?? ''}` },
})

const exitCode = result.status ?? 1
const raw = result.stdout ?? ''

if (exitCode !== 0) {
  // A failure is exactly what the run is for: print everything, unfiltered.
  process.stdout.write(raw)
  process.exit(exitCode)
}

const kept = raw
  .split('\n')
  .filter((line) => {
    if (line.trim() === '') return false
    const plain = stripAnsi(line).trimEnd()
    return !SUCCESS_LINES.some((pattern) => pattern.test(plain))
  })
  .join('\n')
  .trimEnd()

if (kept !== '') process.stdout.write(`${kept}\n`)
