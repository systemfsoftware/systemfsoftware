/**
 * The reuse-path gatekeeper: a written incremental file whose Killed mutants
 * carry killedBy drives the reuse path, and the emitted report carries the
 * same attribution, marked statusReason Remembered.
 */
import { NodeFileSystem, NodePath } from '@effect/platform-node'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Clock, Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import { expect } from 'vitest'

import { generateRunId, makeRunLayer, runMutationTest } from '@systemfsoftware/stryker-js-platform-node'

const Feature = makeFeature({ it, layer })

const Host = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

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

const runOnce = (workDir: string, incrementalFile: string) =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const runStartedAt = yield* Clock.currentTimeMillis
    return yield* Effect.scoped(
      runMutationTest({
        configFile: path.join(workDir, 'stryker.config.json'),
        incremental: true,
        incrementalFile,
        force: false,
        disableBail: true,
        tempDirName: path.join(workDir, '.stryker-tmp'),
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

const readReport = (incrementalFile: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const parsed: unknown = JSON.parse(yield* fs.readFileString(incrementalFile))
    if (!isIncrementalReport(parsed)) {
      return yield* Effect.fail(new Error(`Incremental file at ${incrementalFile} is not a mutation report`))
    }
    return parsed
  })

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
      Given('the reuse-project fixture')(
        'fixture',
        () =>
          Path.Path.pipe(
            Effect.flatMap((path) => path.fromFileUrl(new URL('./__fixtures__/reuse-project', import.meta.url))),
            Effect.provide(Host),
          ),
      ),
      When('the reuse path runs against a seeded incremental file')(
        'emitted',
        (s: { fixture: string }) =>
          Effect.scoped(
            Effect.gen(function*() {
              const fs = yield* FileSystem.FileSystem
              const path = yield* Path.Path
              const scratch = yield* fs.makeTempDirectoryScoped({ prefix: 'reuse-attribution-' })
              const workDir = path.join(scratch, 'project')
              const incrementalFile = path.join(workDir, 'reports', 'stryker-incremental.json')
              yield* fs.copy(s.fixture, workDir)
              yield* runOnce(workDir, incrementalFile)
              const produced = yield* readReport(incrementalFile)
              yield* fs.writeFileString(incrementalFile, JSON.stringify(seedReuseFile(produced), null, 2))
              yield* runOnce(workDir, incrementalFile)
              return yield* readReport(incrementalFile)
            }),
          ).pipe(Effect.provide(Host)),
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
