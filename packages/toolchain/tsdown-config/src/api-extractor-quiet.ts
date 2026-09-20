#!/usr/bin/env node
// api-extractor-quiet.ts — run API Extractor with its success chatter dropped.
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
// It ships as a workspace `bin`, so pnpm links it into every package's
// node_modules/.bin and the package scripts call it by name. The pnpm shim
// execs `node <this file>`, which is why it is a plain script with no Deno
// APIs and no dependencies: Node 24 strips the types and runs it directly.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const EXE = process.platform === 'win32' ? 'api-extractor.cmd' : 'api-extractor'

/** Lines API Extractor prints on every successful run, and only on success. */
const SUCCESS_LINES: readonly RegExp[] = [
  /^api-extractor\s+\d+\.\d+\.\d+.*api-extractor\.com\/?$/u,
  /^Using configuration from .+$/u,
  /^Analysis will use the bundled TypeScript version .+$/u,
  /^API Extractor completed successfully$/u,
]

/** Strip SGR color codes so a colored banner still matches its pattern. */
const stripAnsi = (line: string): string => line.replaceAll(/\u001B\[[0-9;]*m/gu, '')

/** Walk up from `start` looking for the package-local binary shim. */
const resolveReal = (start: string): string | null => {
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
  env: { ...process.env, PATH: `${dirname(real)}:${process.env.PATH ?? ''}` },
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
