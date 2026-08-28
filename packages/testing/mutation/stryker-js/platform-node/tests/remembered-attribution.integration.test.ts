/**
 * The reuse-path gatekeeper: a written incremental file whose Killed mutants
 * carry killedBy drives the reuse path, and the emitted report carries the
 * same attribution, marked statusReason Remembered.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Clock, Effect } from 'effect'
import { expect } from 'vitest'

import { generateRunId, makeRunLayer, runMutationTest } from '@systemfsoftware/stryker-js-platform-node'

const Feature = makeFeature({ it, layer })

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__/reuse-project')

type Location = { readonly start: { line: number; column: number }; readonly end: { line: number; column: number } }

type ReportMutant = {
  readonly id: string
  readonly mutatorName: string
  readonly replacement: string
  readonly location: Location
  readonly status: string
  readonly killedBy?: readonly string[]
  readonly coveredBy?: readonly string[]
  readonly statusReason?: string
}

type IncrementalReport = {
  readonly schemaVersion: string
  readonly thresholds: { readonly high: number; readonly low: number }
  readonly files: Record<string, { language: string; source: string; mutants: ReportMutant[] }>
}

type Setup = {
  readonly workDir: string
  readonly incrementalFile: string
}

const runOnce = (workDir: string, incrementalFile: string) =>
  Effect.gen(function*() {
    const runStartedAt = yield* Clock.currentTimeMillis
    return yield* Effect.scoped(
      runMutationTest({
        configFile: join(workDir, 'stryker.config.json'),
        incremental: true,
        incrementalFile,
        force: false,
        disableBail: true,
        tempDirName: join(workDir, '.stryker-tmp'),
      }),
    ).pipe(
      Effect.provide(
        makeRunLayer({
          runId: generateRunId(),
          resolvedMode: { mode: 'human', signal: 'env', stdoutIsTTY: false },
          runStartedAt,
          basePath: workDir,
          reporterPluginModules: [],
          allowConsoleColors: false,
        }),
      ),
    )
  })

const isIncrementalReport = (value: unknown): value is IncrementalReport => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return 'files' in value && 'schemaVersion' in value && 'thresholds' in value
}

const readReport = (incrementalFile: string): IncrementalReport => {
  const parsed: unknown = JSON.parse(readFileSync(incrementalFile, 'utf8'))
  if (!isIncrementalReport(parsed)) {
    throw new Error(`Incremental file at ${incrementalFile} is not a mutation report`)
  }
  return parsed
}

const seedReuseFile = (report: IncrementalReport): IncrementalReport => {
  const listed = Object.values(report.files).flatMap((file) => file.mutants)
  if (listed.length < 2) {
    throw new Error('Fixture produced fewer than two mutants; the reuse gatekeeper needs a Killed and a Timeout')
  }
  const files: IncrementalReport['files'] = {}
  let remainingKilled = 1
  let remainingTimeout = 1
  for (const [name, file] of Object.entries(report.files)) {
    files[name] = {
      ...file,
      mutants: file.mutants.map((mutant) => {
        if (remainingKilled > 0) {
          remainingKilled -= 1
          return { ...mutant, status: 'Killed', killedBy: ['t1'], coveredBy: ['t1'] }
        }
        if (remainingTimeout > 0) {
          remainingTimeout -= 1
          const { killedBy: _killedBy, coveredBy: _coveredBy, ...rest } = mutant
          return { ...rest, status: 'Timeout' }
        }
        return mutant
      }),
    }
  }
  return { ...report, files }
}

Feature('Remembered incremental verdicts keep kill attribution').body(({ scenario }) => {
  scenario(
    'Should_KeepKilledBy_When_ReusingAnAttributedIncrementalFile',
    Gherkin.Do.pipe(
      Given('a fixture whose incremental file records one attributed kill and one timeout')('setup', () => {
        const workDir = mkdtempSync(join(tmpdir(), 'reuse-attribution-'))
        cpSync(FIXTURE, workDir, { recursive: true })
        const incrementalFile = join(workDir, 'reports', 'stryker-incremental.json')
        return runOnce(workDir, incrementalFile).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              writeFileSync(incrementalFile, JSON.stringify(seedReuseFile(readReport(incrementalFile)), null, 2))
            })
          ),
          Effect.map(() => ({ workDir, incrementalFile }) satisfies Setup),
          Effect.catchCause((cause) => {
            rmSync(workDir, { recursive: true, force: true })
            return Effect.failCause(cause)
          }),
        )
      }),
      When('the reuse path runs against that file')(
        'emitted',
        (s: { setup: Setup }) =>
          runOnce(s.setup.workDir, s.setup.incrementalFile).pipe(
            Effect.map(() => readReport(s.setup.incrementalFile)),
            Effect.ensuring(Effect.sync(() => {
              rmSync(s.setup.workDir, { recursive: true, force: true })
            })),
          ),
      ),
      Then('the killed mutant keeps killedBy and Remembered, and the timeout stays unattributed')((s: {
        emitted: IncrementalReport
      }) => {
        const mutants = Object.values(s.emitted.files).flatMap((file) => file.mutants)
        const killed = mutants.find((mutant) => mutant.status === 'Killed')
        const timedOut = mutants.find((mutant) => mutant.status === 'Timeout')
        expect(killed).toBeDefined()
        expect(killed?.killedBy).toEqual(['t1'])
        expect(killed?.coveredBy).toEqual(['t1'])
        expect(killed?.statusReason).toBe('Remembered')
        expect(timedOut).toBeDefined()
        expect(timedOut?.killedBy).toBeUndefined()
        expect(timedOut?.statusReason).toBe('Remembered')
      }),
    ),
  )
})
