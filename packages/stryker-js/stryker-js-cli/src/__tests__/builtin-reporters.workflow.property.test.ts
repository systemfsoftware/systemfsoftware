import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import type { MutantStatus } from '@systemfsoftware/stryker-js/Mutant'
import { calculateMetrics } from '@systemfsoftware/stryker-js/Report'
import type { MetricsResult, MutantResult, MutationTestResult } from '@systemfsoftware/stryker-js/Report'
import type { ReporterEvent, ReporterFactory } from '@systemfsoftware/stryker-js/Reporter'
import { Array as Arr } from 'effect'
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

const STATUS_ARB = fc.constantFrom<MutantStatus>(
  'Killed',
  'Survived',
  'NoCoverage',
  'CompileError',
  'RuntimeError',
  'Timeout',
  'Ignored',
  'Pending',
)

const MUTATOR_ARB = fc.constantFrom(
  'BooleanLiteral',
  'StringLiteral',
  'ArithmeticOperator',
  'BlockStatement',
  'ConditionalExpression',
  'EqualityOperator',
)

const KILLED: MutantStatus = 'Killed'

type MutantObservation = readonly [id: string, status: MutantStatus, mutator: string]

const observationOf = (
  numbers: readonly number[],
  statuses: readonly MutantStatus[],
  mutators: readonly string[],
): readonly MutantObservation[] =>
  Arr.map(
    Arr.zip(Arr.zip(Arr.map(numbers, String), statuses), mutators),
    ([[id, status], mutator]) => [id, status, mutator] as const,
  )

const POPULATION_ARB: fc.Arbitrary<readonly MutantObservation[]> = fc
  .uniqueArray(fc.nat({ max: 99 }), { minLength: 1, maxLength: 4 })
  .chain((numbers) =>
    fc.tuple(
      fc.array(STATUS_ARB, { minLength: numbers.length, maxLength: numbers.length }),
      fc.array(MUTATOR_ARB, { minLength: numbers.length, maxLength: numbers.length }),
    ).map(([statuses, mutators]) => observationOf(numbers, statuses, mutators))
  )

const ALL_KILLED_ARB: fc.Arbitrary<readonly MutantObservation[]> = fc
  .uniqueArray(fc.nat({ max: 99 }), { minLength: 1, maxLength: 4 })
  .chain((numbers) =>
    fc.array(MUTATOR_ARB, { minLength: numbers.length, maxLength: numbers.length }).map((mutators) =>
      observationOf(numbers, Arr.map(numbers, () => KILLED), mutators)
    )
  )

const reportOf = (population: readonly MutantObservation[]): MutationTestResult => {
  const mutants: MutantResult[] = Arr.map(
    population,
    ([id, status, mutator], index): MutantResult => {
      const mutant: MutantResult = {
        id,
        mutatorName: mutator,
        status,
        location: { start: { line: index + 1, column: 0 }, end: { line: index + 1, column: 4 } },
        coveredBy: ['0'],
      }
      if (status === KILLED) {
        return { ...mutant, killedBy: ['0'] }
      }
      return mutant
    },
  )
  return {
    schemaVersion: '1.0',
    files: {
      [MARKER_FILE]: {
        language: 'typescript',
        source: 'export const marker = true',
        mutants,
      },
    },
    thresholds: { high: 80, low: 60 },
    testFiles: {
      [MARKER_TEST_FILE]: { tests: [{ id: '0', name: 'the marker is true' }] },
    },
  }
}

interface CompletedRun {
  readonly report: MutationTestResult
  readonly metrics: MetricsResult
}

const completedRun = (population: readonly MutantObservation[]): CompletedRun => {
  const report = reportOf(population)
  return { report, metrics: calculateMetrics(report.files) }
}

const dryRunCompleted = (): ReporterEvent => ({
  _tag: 'dryRunCompleted',
  timing: { net: 1, overhead: 0 },
  capabilities: { reloadEnvironment: false },
  testCount: 1,
  tests: [],
})

const mutationTestingPlanReady = (population: readonly MutantObservation[]): ReporterEvent => ({
  _tag: 'mutationTestingPlanReady',
  total: population.length,
  plans: Arr.map(population, ([id], index) => ({
    mutantId: id,
    plan: 'Run' as const,
    netTime: index + 1,
    reloadEnvironment: false,
  })),
})

const mutantTested = (observation: MutantObservation, index: number, total: number): ReporterEvent => ({
  _tag: 'mutantTested',
  id: observation[0],
  status: observation[1],
  file: MARKER_FILE,
  location: { start: { line: 1, column: 0 }, end: { line: 1, column: 4 } },
  mutator: observation[2],
  replacement: null,
  completed: index + 1,
  total,
})

const runEvents = (population: readonly MutantObservation[]): readonly ReporterEvent[] => [
  dryRunCompleted(),
  mutationTestingPlanReady(population),
  ...Arr.map(population, (observation, index) => mutantTested(observation, index, population.length)),
  { _tag: 'mutationTestReportReady', ...completedRun(population) },
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
  const STDOUT_VISIBLE: Record<MutantStatus, boolean> = {
    Killed: false,
    Survived: true,
    NoCoverage: true,
    CompileError: false,
    RuntimeError: false,
    Timeout: false,
    Ignored: false,
    Pending: false,
  }

  it.effect.prop(
    '∀p_Populations_≡EveryMutantObservationReachesTheClearTextTable',
    [POPULATION_ARB],
    ([population]) => {
      const run = completedRun(population)
      fc.pre(Number.isFinite(run.metrics.metrics.mutationScore))
      fc.pre(Number.isFinite(run.metrics.metrics.mutationScoreBasedOnCoveredCode))
      fc.pre(run.metrics.metrics.mutationScore < 100)
      return Effect.gen(function*() {
        const terminal = yield* writeReport('clear-text', runEvents(population))
        return terminal.includes('All files') && terminal.includes(MARKER_FILE) &&
          population.every(([, status, mutator]) =>
            terminal.includes(`[${status}] ${mutator}`) === STDOUT_VISIBLE[status]
          )
      })
    },
  )

  it.effect.prop(
    '∀p_AllKilledPopulations_≡TheScoreTableReportsAPerfectScore',
    [ALL_KILLED_ARB],
    ([population]) =>
      Effect.gen(function*() {
        const terminal = yield* writeReport('clear-text', runEvents(population))
        return terminal.includes('100.00')
      }),
  )

  it.effect.prop(
    '∀k_EventPrefixes_≡NothingPrintsBeforeTheReportEvent',
    [fc.nat({ max: 3 })],
    ([k]) =>
      Effect.gen(function*() {
        const terminal = yield* writeReport(
          'clear-text',
          runEvents([['0', KILLED, 'BooleanLiteral']]).slice(0, k),
        )
        return terminal === ''
      }),
  )

  it.effect.prop(
    '∀k_TestedCounts_≡TheProgressLineClosesItsLine',
    [fc.nat({ max: 4 })],
    ([k]) =>
      Effect.gen(function*() {
        const population: readonly MutantObservation[] = Arr.map(
          Arr.makeBy(k + 1, (index) => String(index)),
          (id) => [id, KILLED, 'BooleanLiteral'] as const,
        )
        const terminal = yield* writeReport('progress', runEvents(population))
        return terminal.includes('Mutants tested') && terminal.endsWith('\n')
      }),
  )

  it.effect.prop(
    '∀e_EventLists_≡TheMachineProgressReporterLeavesTheTerminalUntouched',
    [fc.nat({ max: 4 })],
    ([k]) =>
      Effect.gen(function*() {
        const terminal = yield* writeReport(
          'progress-stream',
          runEvents([['0', KILLED, 'BooleanLiteral']]).slice(0, k),
        )
        return terminal === ''
      }),
  )
})
