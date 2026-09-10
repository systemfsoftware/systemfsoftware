/**
 * Output pin for the html pull-stream reporter (U3).
 *
 * A streamed run's four events drive the factory consumer; the written
 * document must embed the terminal report payload, must be a pure function
 * of that payload (same event -> same bytes), and must carry no
 * host-provided paths. The element bundle must come from this package's own
 * install: a decoy bundle planted next to the output must not leak in.
 */
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { makeHtmlReporter } from '@systemfsoftware/stryker-js-html-reporter'
import {
  DryRunCompleted,
  MutantTested,
  MutationTestingPlanReady,
  MutationTestReportReady,
} from '@systemfsoftware/stryker-js/ReporterEvent'
import type { MutationTestMetricsResult, ReporterEvent } from '@systemfsoftware/stryker-js/ReporterEvent'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import * as S from 'effect/Schema'
import type * as reportApi from 'mutation-testing-report-schema/api'
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

// Test/fixture exception to no-sync-schema-codecs: throwing IS the assertion
// for a hand-built options document with schema defaults filled in.
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

const metricsFixture = (): MutationTestMetricsResult => ({
  systemUnderTestMetrics: {
    name: 'root',
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
  },
  testMetrics: undefined,
})

const runEvents = (
  report: reportApi.MutationTestResult,
  metrics: MutationTestMetricsResult,
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
    'A completed run writes the terminal report from the package bundle',
    Gherkin.Do.pipe(
      Given('an output directory with a decoy bundle next to it')('output', () =>
        Effect.promise(async () => {
          const dir = await makeTempDir('html-factory-pin-')
          const fileName = await joinPath(dir, 'index.html')
          await writeText(await joinPath(dir, 'mutation-test-elements.js'), 'DECOY-BUNDLE')
          return { dir, fileName }
        })),
      When('the factory consumes a completed run')('html', (s) =>
        Effect.promise(async () => {
          try {
            const consume = makeHtmlReporter(optionsWith(s.output.fileName), {})
            await consume(toStream(runEvents(reportFixture(), metricsFixture())))
            return await readText(s.output.fileName)
          } finally {
            await removeDir(s.output.dir)
          }
        })),
      Then('the written document embeds the terminal report')((s) => {
        expect(s.html).toContain(MARKER)
        expect(s.html).toContain('mutation-test-report-app')
      }),
      Then('the document carries the package bundle, never the decoy or a host path')((s) => {
        expect(s.html).not.toContain('DECOY-BUNDLE')
        expect(s.html).not.toContain(s.output.dir)
      }),
    ),
  )

  scenario(
    'The same terminal payload writes byte-identical documents',
    Gherkin.Do.pipe(
      Given('a completed run payload')('run', () =>
        Effect.succeed({
          report: reportFixture(),
          metrics: metricsFixture(),
        })),
      When('the factory consumes the payload into two outputs')('documents', (s) =>
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
      Then('the first output exists')((s) => {
        expect(s.documents.existed).toBe(true)
      }),
      Then('both documents are byte-identical')((s) => {
        expect(s.documents.a).toBe(s.documents.b)
      }),
    ),
  )
})
