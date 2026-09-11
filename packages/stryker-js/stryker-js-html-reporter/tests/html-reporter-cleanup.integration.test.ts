import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { makeHtmlReporter } from '@systemfsoftware/stryker-js-html-reporter'
import type { MetricsResult } from '@systemfsoftware/stryker-js/Metrics'
import type * as reportApi from '@systemfsoftware/stryker-js/Report'
import { DryRunCompleted, MutationTestReportReady } from '@systemfsoftware/stryker-js/ReporterEvent'
import type { ReporterEvent } from '@systemfsoftware/stryker-js/ReporterEvent'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import * as S from 'effect/Schema'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const MARKER = 'html-cleanup-pin-4b1e'

const nodeFsPathLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

const runNode = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
): Promise<A> => Effect.runPromise(Effect.provide(effect, nodeFsPathLayer))

const makeTempDir = (prefix: string): Promise<string> =>
  runNode(
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      return yield* fs.makeTempDirectory({ prefix })
    }),
  )

const joinPath = (...parts: ReadonlyArray<string>): Promise<string> =>
  runNode(
    Effect.gen(function*() {
      const path = yield* Path.Path
      return path.join(...parts)
    }),
  )

const readText = (file: string): Promise<string> =>
  runNode(
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      return yield* fs.readFileString(file)
    }),
  )

const fileExists = (file: string): Promise<boolean> =>
  runNode(
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      return yield* fs.exists(file)
    }),
  )

const removeDir = (dir: string): Promise<void> =>
  runNode(
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      yield* fs.remove(dir, { recursive: true })
    }),
  )

const optionsWith = (fileName: string) => S.decodeUnknownSync(StrykerOptionsSchema)({ htmlReporter: { fileName } })

const reportFixture = (): reportApi.MutationTestResult => ({
  schemaVersion: '1.0',
  files: {
    'src/marker.ts': {
      language: 'typescript',
      source: `export const marker = '${MARKER}'`,
      mutants: [
        {
          id: '0',
          mutatorName: 'BlockStatement',
          status: 'Killed',
          location: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
        },
      ],
    },
  },
  thresholds: { high: 80, low: 60 },
})

const metricsFixture = (): MetricsResult => ({
  name: 'All files',
  metrics: {
    pending: 0,
    killed: 1,
    timeout: 0,
    survived: 0,
    noCoverage: 0,
    runtimeErrors: 0,
    compileErrors: 0,
    ignored: 0,
    totalDetected: 1,
    totalUndetected: 0,
    totalInvalid: 0,
    totalValid: 1,
    totalMutants: 1,
    totalCovered: 1,
    mutationScore: 100,
    mutationScoreBasedOnCoveredCode: 100,
  },
  childResults: [],
})

const dryRunEvent = (): ReporterEvent =>
  new DryRunCompleted({
    timing: { net: 1, overhead: 0 },
    capabilities: { reloadEnvironment: false },
    testCount: 0,
    tests: [],
  })

const terminalEvent = (): ReporterEvent =>
  new MutationTestReportReady({ report: reportFixture(), metrics: metricsFixture() })

async function* toStream(events: readonly ReporterEvent[]): AsyncGenerator<ReporterEvent> {
  yield* events
}

Feature('Keeping the report when a run is interrupted').body(({ scenario }) => {
  scenario(
    'An interrupted run leaves no report behind',
    Gherkin.Do.pipe(
      Given('an output directory')('output', () =>
        Effect.promise(async () => {
          const dir = await makeTempDir('html-cleanup-early-')
          return { dir, fileName: await joinPath(dir, 'index.html') }
        })),
      When('the interrupted run is followed by a completed run')(
        'outcome',
        (s) =>
          Effect.promise(async () => {
            try {
              const first = makeHtmlReporter(optionsWith(s.output.fileName), {})
              await first(toStream([dryRunEvent()]))
              const earlyWritten = await fileExists(s.output.fileName)
              const followUp = makeHtmlReporter(optionsWith(s.output.fileName), {})
              await followUp(toStream([dryRunEvent(), terminalEvent()]))
              return { earlyWritten, html: await readText(s.output.fileName) }
            } finally {
              await removeDir(s.output.dir)
            }
          }),
      ),
      Then('the interrupted run writes no report')((s) => {
        expect(s.outcome.earlyWritten).toBe(false)
      }),
      Then('the completed run writes the report')((s) => {
        expect(s.outcome.html).toContain(MARKER)
      }),
    ),
  )

  scenario(
    'A run that fails after writing its report leaves the report on disk',
    Gherkin.Do.pipe(
      Given('an output directory')('output', () =>
        Effect.promise(async () => {
          const dir = await makeTempDir('html-cleanup-abrupt-')
          return { dir, fileName: await joinPath(dir, 'index.html') }
        })),
      When('the run fails after the report is ready')(
        'outcome',
        (s) =>
          Effect.promise(async () => {
            async function* breakingStream(): AsyncGenerator<ReporterEvent> {
              yield terminalEvent()
              throw new Error('stream broke')
            }
            try {
              const consume = makeHtmlReporter(optionsWith(s.output.fileName), {})
              const failure = await consume(breakingStream()).then(
                () => 'resolved',
                (error: unknown) => {
                  if (error instanceof Error) {
                    return error.message
                  }
                  throw error
                },
              )
              const html = await readText(s.output.fileName)
              const followUp = makeHtmlReporter(optionsWith(s.output.fileName), {})
              await followUp(toStream([terminalEvent()]))
              return { failure, html, rerun: await readText(s.output.fileName) }
            } finally {
              await removeDir(s.output.dir)
            }
          }),
      ),
      Then('the failure reaches the caller')((s) => {
        expect(s.outcome.failure).toContain('stream broke')
      }),
      Then('the written report survives the failure')((s) => {
        expect(s.outcome.html).toContain(MARKER)
      }),
      Then('the following run writes its report')((s) => {
        expect(s.outcome.rerun).toContain(MARKER)
      }),
    ),
  )
})
