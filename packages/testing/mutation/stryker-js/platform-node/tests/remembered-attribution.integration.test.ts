import { NodeFileSystem, NodePath } from '@effect/platform-node'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Clock, Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import * as S from 'effect/Schema'
import { expect } from 'vitest'

import {
  generateRunId,
  IncrementalReportSchema,
  makeRunLayer,
  runMutationTest,
} from '@systemfsoftware/stryker-js-platform-node'

const Feature = makeFeature({ it, layer })

const Host = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

type IncrementalReport = typeof IncrementalReportSchema.Type

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

const readReport = (incrementalFile: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const text = yield* fs.readFileString(incrementalFile)
    return yield* S.decodeUnknownEffect(S.fromJsonString(IncrementalReportSchema))(text)
  })

const writeReport = (incrementalFile: string, report: IncrementalReport) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const encoded = yield* S.encodeEffect(S.fromJsonString(IncrementalReportSchema, { space: 2 }))(report)
    yield* fs.writeFileString(incrementalFile, encoded)
  })

const seedReuseFile = (report: IncrementalReport): IncrementalReport => {
  const listed = Object.values(report.files).flatMap((file) => file.mutants)
  if (listed.length < 2) {
    throw new Error('Fixture produced fewer than two mutants; the reuse gatekeeper needs a Killed and a Timeout')
  }
  let remainingKilled = 1
  let remainingTimeout = 1
  const files: Record<string, IncrementalReport['files'][string]> = {}
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

Feature('Remembered incremental verdicts keep kill attribution')
  .withLayer(Host)
  .body(({ scenario }) => {
    scenario(
      'Reusing a seeded incremental file keeps every previous killer attribution',
      Gherkin.Do.pipe(
        Given('the reuse-project fixture')(
          'fixture',
          () =>
            Path.Path.pipe(
              Effect.flatMap((path) => path.fromFileUrl(new URL('./__fixtures__/reuse-project', import.meta.url))),
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
                yield* writeReport(incrementalFile, seedReuseFile(produced))
                yield* runOnce(workDir, incrementalFile)
                return yield* readReport(incrementalFile)
              }),
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
