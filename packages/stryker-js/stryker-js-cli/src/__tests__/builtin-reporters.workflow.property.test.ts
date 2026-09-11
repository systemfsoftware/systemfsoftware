import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { calculateMetrics } from '@systemfsoftware/stryker-js/Report'
import type { MetricsResult, MutantResult, MutationTestResult } from '@systemfsoftware/stryker-js/Report'
import type { ReporterEvent, ReporterFactory } from '@systemfsoftware/stryker-js/Reporter'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import { FastCheck as fc } from 'effect/testing'

import { makeBuiltinReporterFactories } from '../report/builtin-reporters.js'
import { createDefaultOptions } from '../run/Config.js'

const MARKER_FILE = 'src/marker.ts'
const MARKER_TEST_FILE = 'src/marker.test.ts'

const OPTIONS = Effect.runSync(createDefaultOptions())

const reporterFsLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

const reporterFactories = Effect.gen(function*() {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  return makeBuiltinReporterFactories({ fileSystem, path })
})

const markerMutants = (status: 'Killed' | 'Survived'): readonly MutantResult[] => {
  const mutant: MutantResult = {
    id: '0',
    mutatorName: 'BooleanLiteral',
    replacement: 'false',
    status,
    location: { start: { line: 1, column: 24 }, end: { line: 1, column: 28 } },
    coveredBy: ['0'],
  }
  if (status === 'Killed') {
    return [{ ...mutant, killedBy: ['0'] }]
  }
  return [mutant]
}

const markerReport = (status: 'Killed' | 'Survived'): MutationTestResult => ({
  schemaVersion: '1.0',
  files: {
    [MARKER_FILE]: {
      language: 'typescript',
      source: 'export const marker = true',
      mutants: markerMutants(status),
    },
  },
  thresholds: { high: 80, low: 60 },
  testFiles: {
    [MARKER_TEST_FILE]: { tests: [{ id: '0', name: 'the marker is true' }] },
  },
})

interface CompletedRun {
  readonly report: MutationTestResult
  readonly metrics: MetricsResult
}

const completedRun = (status: 'Killed' | 'Survived'): CompletedRun => {
  const report = markerReport(status)
  return { report, metrics: calculateMetrics(report.files) }
}

const dryRunCompleted = (): ReporterEvent => ({
  _tag: 'dryRunCompleted',
  timing: { net: 1, overhead: 0 },
  capabilities: { reloadEnvironment: false },
  testCount: 1,
  tests: [],
})

const mutationTestingPlanReady = (): ReporterEvent => ({
  _tag: 'mutationTestingPlanReady',
  total: 1,
  plans: [{ mutantId: '0', plan: 'Run', netTime: 1, reloadEnvironment: false }],
})

const mutantTested = (): ReporterEvent => ({
  _tag: 'mutantTested',
  id: '0',
  status: 'Killed',
  file: MARKER_FILE,
  location: { start: { line: 1, column: 24 }, end: { line: 1, column: 28 } },
  mutator: 'BooleanLiteral',
  replacement: null,
  completed: 1,
  total: 1,
})

const runEvents = (run: CompletedRun): readonly ReporterEvent[] => [
  dryRunCompleted(),
  mutationTestingPlanReady(),
  mutantTested(),
  { _tag: 'mutationTestReportReady', report: run.report, metrics: run.metrics },
]

async function* toStream(events: readonly ReporterEvent[]): AsyncGenerator<ReporterEvent> {
  yield* events
}

const withCapturedStdout = async (run: () => Promise<void>): Promise<string> => {
  const chunks: string[] = []
  Object.assign(process.stdout, {
    write: (chunk: unknown): boolean => {
      chunks.push(String(chunk))
      return true
    },
  })
  try {
    await run()
    return chunks.join('')
  } finally {
    Reflect.deleteProperty(process.stdout, 'write')
  }
}

const writeReport = (
  name: string,
  events: readonly ReporterEvent[],
): Effect.Effect<string> =>
  Effect.gen(function*() {
    const factories = yield* Effect.provide(reporterFactories, reporterFsLayer)
    const factory: ReporterFactory | undefined = factories[name]
    if (factory === undefined) {
      return yield* Effect.die(new Error(`no builtin reporter answers to "${name}"`))
    }
    return yield* Effect.promise(() => withCapturedStdout(() => factory(OPTIONS, {})(toStream(events))))
  })

describe('builtin reporters', () => {
  it.effect.prop(
    '∀c_SurvivingRun_≡TheScoreTableAndTheSurvivorReachTheTerminal',
    [fc.constant(completedRun('Survived'))],
    ([run]) =>
      Effect.gen(function*() {
        const terminal = yield* writeReport('clear-text', runEvents(run))
        return terminal.includes('All files') &&
          terminal.includes(MARKER_FILE) &&
          terminal.includes('[Survived] BooleanLiteral')
      }),
  )

  it.effect.prop(
    '∀c_AllKilledRun_≡TheScoreTableReportsAPerfectScore',
    [fc.constant(completedRun('Killed'))],
    ([run]) =>
      Effect.gen(function*() {
        const terminal = yield* writeReport('clear-text', runEvents(run))
        return terminal.includes('100.00')
      }),
  )

  it.effect.prop(
    '∀c_EventsWithoutTheReport_≡NothingReachesTheTerminal',
    [fc.constant(runEvents(completedRun('Killed')).slice(0, 3))],
    ([events]) =>
      Effect.gen(function*() {
        const terminal = yield* writeReport('clear-text', events)
        return terminal === ''
      }),
  )

  it.effect.prop(
    '∀c_FinishedPlan_≡TheProgressBarCountsMutantsAndClosesItsLine',
    [fc.constant(runEvents(completedRun('Killed')).slice(0, 3))],
    ([events]) =>
      Effect.gen(function*() {
        const terminal = yield* writeReport('progress', events)
        return terminal.includes('Mutants tested') && terminal.endsWith('\n')
      }),
  )

  it.effect.prop(
    '∀c_FinishedPlan_≡TheMachineProgressReporterLeavesTheTerminalUntouched',
    [fc.constant(runEvents(completedRun('Killed')))],
    ([events]) =>
      Effect.gen(function*() {
        const terminal = yield* writeReport('progress-stream', events)
        return terminal === ''
      }),
  )
})
