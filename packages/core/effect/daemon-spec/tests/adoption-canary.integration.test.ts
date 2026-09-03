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
const scratchDir = join(packageDir, 'adoption-canary-scratch', 'src')
const scratchFile = join(scratchDir, 'ceremony.ts')
const configPath = join(packageDir, 'oxlint.config.ts')

const writeScratch = (): void => {
  mkdirSync(scratchDir, { recursive: true })
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
const runAdoptionProbe = (): ProbeReport => {
  writeScratch()
  try {
    execFileSync('pnpm', ['exec', 'oxlint', '--no-ignore', '--config', configPath, scratchFile], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
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
        Given('the daemon-spec backoff kernel constructs a schedule')(() =>
          Effect.sync(() => {
            expect(typeof cappedBackoff(Duration.millis(1), Duration.millis(8))).toBe('object')
          })
        ),
        When('oxlint scans a ceremony fixture with the package config')(
          'report',
          () => Effect.sync(() => runAdoptionProbe()),
        ),
        Then('the scan fails naming in-source-test-laws-only')((s) =>
          Effect.sync(() => {
            expect(s.report.status).not.toBe(0)
            expect(s.report.output.includes('in-source-test-laws-only')).toBe(true)
          })
        ),
      ),
    )
  })
