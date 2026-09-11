import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { makeHtmlReporter } from '@systemfsoftware/stryker-js-html-reporter'
import type { MetricsResult } from '@systemfsoftware/stryker-js/Metrics'
import type * as reportApi from '@systemfsoftware/stryker-js/Report'
import {
  DryRunCompleted,
  MutantTested,
  MutationTestingPlanReady,
  MutationTestReportReady,
} from '@systemfsoftware/stryker-js/ReporterEvent'
import type { ReporterEvent } from '@systemfsoftware/stryker-js/ReporterEvent'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import * as S from 'effect/Schema'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const MARKER = 'html-factory-pin-7d2c'

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

const writeText = (file: string, content: string): Promise<void> =>
  runNode(
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      yield* fs.writeFileString(file, content)
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

const runEvents = (
  report: reportApi.MutationTestResult,
  metrics: MetricsResult,
): readonly ReporterEvent[] => [
  new DryRunCompleted({
    timing: { net: 1, overhead: 0 },
    capabilities: { reloadEnvironment: false },
    testCount: 0,
    tests: [],
  }),
  new MutationTestingPlanReady({
    total: 1,
    plans: [{ mutantId: '0', plan: 'Run', netTime: 1, reloadEnvironment: false }],
  }),
  new MutantTested({
    id: '0',
    status: 'Killed',
    file: 'src/marker.ts',
    location: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
    mutator: 'BlockStatement',
    replacement: null,
    completed: 1,
    total: 1,
  }),
  new MutationTestReportReady({ report, metrics }),
]

async function* toStream(events: readonly ReporterEvent[]): AsyncGenerator<ReporterEvent> {
  yield* events
}

Feature('Writing the html mutation report').body(({ scenario }) => {
  scenario(
    'A completed run writes a self-contained report',
    Gherkin.Do.pipe(
      Given('an output directory beside an unrelated bundle file')('output', () =>
        Effect.promise(async () => {
          const dir = await makeTempDir('html-factory-pin-')
          const fileName = await joinPath(dir, 'index.html')
          await writeText(await joinPath(dir, 'mutation-test-elements.js'), 'DECOY-BUNDLE')
          return { dir, fileName }
        })),
      When('the reporter consumes a completed run')('html', (s) =>
        Effect.promise(async () => {
          try {
            const consume = makeHtmlReporter(optionsWith(s.output.fileName), {})
            await consume(toStream(runEvents(reportFixture(), metricsFixture())))
            return await readText(s.output.fileName)
          } finally {
            await removeDir(s.output.dir)
          }
        })),
      Then('the written document embeds the run result')((s) => {
        expect(s.html).toContain(MARKER)
        expect(s.html).toContain('mutation-test-report-app')
      }),
      Then('the document carries its own bundle, not the neighbouring file or a host path')((s) => {
        expect(s.html).not.toContain('DECOY-BUNDLE')
        expect(s.html).not.toContain(s.output.dir)
      }),
    ),
  )

  scenario(
    'The same run writes the same document twice',
    Gherkin.Do.pipe(
      Given('a completed run')('run', () =>
        Effect.succeed({
          report: reportFixture(),
          metrics: metricsFixture(),
        })),
      When('the reporter writes the same run into two directories')('documents', (s) =>
        Effect.promise(async () => {
          const dirA = await makeTempDir('html-purity-a-')
          const dirB = await makeTempDir('html-purity-b-')
          try {
            const fileA = await joinPath(dirA, 'index.html')
            const fileB = await joinPath(dirB, 'index.html')
            await makeHtmlReporter(optionsWith(fileA), {})(toStream(runEvents(s.run.report, s.run.metrics)))
            await makeHtmlReporter(optionsWith(fileB), {})(toStream(runEvents(s.run.report, s.run.metrics)))
            const existed = await fileExists(fileA)
            return { a: await readText(fileA), b: await readText(fileB), existed }
          } finally {
            await removeDir(dirA)
            await removeDir(dirB)
          }
        })),
      Then('a report is written')((s) => {
        expect(s.documents.existed).toBe(true)
      }),
      Then('both documents are identical')((s) => {
        expect(s.documents.a).toBe(s.documents.b)
      }),
    ),
  )
})
