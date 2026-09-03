/// <reference types="node" />
import { cappedBackoff } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect } from 'effect'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const testsDir = dirname(fileURLToPath(import.meta.url))
const packageDir = join(testsDir, '..')
const repoRoot = join(packageDir, '..', '..', '..', '..')
// Per-process scratch: parallel vitest workers (and any future Stryker
// worker) must never share one fixture path.
const scratchDir = join(packageDir, 'adoption-canary-scratch', String(process.pid))
const scratchFile = join(scratchDir, 'src', 'ceremony.ts')
const configPath = join(packageDir, 'oxlint.config.ts')
// The oxlint binary directly — no pnpm layer, so the probe stays well under
// the mutation runner's per-test timeout.
const oxlintBin = join(repoRoot, 'node_modules', '.bin', 'oxlint')

const writeScratch = (): void => {
  mkdirSync(dirname(scratchFile), { recursive: true })
  writeFileSync(scratchFile, "import { it } from 'vitest'\nit('x', () => {})\n")
}

type ProbeReport = { readonly status: number; readonly output: string }

const textOf = (value: unknown): string => (typeof value === 'string' ? value : '')

const probeStatusOf = (error: unknown): number => {
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : 1
}

const probeOutputOf = (error: unknown): string => {
  const stdout = textOf((error as { stdout?: unknown }).stdout)
  const stderr = textOf((error as { stderr?: unknown }).stderr)
  return `${stdout}\n${stderr}`
}

// Spawn proves the wiring loads and fires end to end: the package's real
// config against a ceremony fixture. Fail-closed by construction — a skipped
// file, a missing binary, or a silent rule all report status 0 or output
// without the rule name, which the assertions below reject.
//
// This file imports nothing but the barrel and its runner: with per-test
// coverage analysis the mutation runner attaches it only to the barrel call
// in the Given below, never to the whole src tree.
const runAdoptionProbe = (): ProbeReport => {
  writeScratch()
  try {
    execFileSync(oxlintBin, ['--no-ignore', '--config', configPath, scratchFile], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 60000,
    })
    return { status: 0, output: '' }
  } catch (error) {
    return { status: probeStatusOf(error), output: probeOutputOf(error) }
  }
}

afterAll(() => {
  rmSync(scratchDir, { recursive: true, force: true })
})

Feature('Adoption canary')
  .body(({ scenario }) => {
    scenario(
      'Adopted rules fire on ceremony',
      Gherkin.Do.pipe(
        Given('the backoff kernel constructs a bounded schedule')(() =>
          Effect.sync(() => {
            expect(cappedBackoff(Duration.millis(1), Duration.millis(8))).toBeDefined()
          })
        ),
        Given('a ceremony fixture is staged in the adopting package')(() => Effect.sync(() => writeScratch())),
        When('oxlint scans the fixture with the package config')('report', () => Effect.sync(() => runAdoptionProbe())),
        Then('the scan fails naming in-source-test-laws-only')((s) =>
          Effect.sync(() => {
            expect(s.report.status).not.toBe(0)
            expect(s.report.output.includes('in-source-test-laws-only')).toBe(true)
          })
        ),
      ),
    )
  })
