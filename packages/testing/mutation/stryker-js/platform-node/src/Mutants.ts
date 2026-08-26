import { Cell } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as MutableHashSet from 'effect/MutableHashSet'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import type { CoverageData, TestPlan } from '@systemfsoftware/stryker-js/Mutant'
import type { CompleteDryRunResult, TestResult } from '@systemfsoftware/stryker-js/TestRunner'

import {
  IncrementalDiffCommand,
  incrementalDifferWorkflow,
  PreviousFilesSchema,
  PreviousTestFilesSchema,
  toRelativeNormalizedFileName,
} from './IncrementalDiff.workflow.js'
import {
  HIT_LIMIT_FACTOR,
  planMutantTests,
  PlanMutantTestsCommand,
  type PlanMutantTestsError,
  PlannedMutantTests,
} from './Mutants.workflow.js'
export { HIT_LIMIT_FACTOR }

// ---------------------------------------------------------------------------
// Diff statistics
// ---------------------------------------------------------------------------

export interface DiffChanges {
  readonly added: number
  readonly removed: number
}

export type DiffChange = 'added' | 'removed'

export interface DiffStatistics {
  readonly changesByFile: MutableHashMap.MutableHashMap<string, DiffChanges>
  readonly total: DiffChanges
}
const ZERO = 0
const ONE = 1
export const emptyDiffChanges = (): DiffChanges => ({ added: ZERO, removed: ZERO })

export const diffChangesToString = (changes: Readonly<DiffChanges>): string => `+${changes.added} -${changes.removed}`

export const emptyDiffStatistics = (): DiffStatistics => ({
  changesByFile: MutableHashMap.empty<string, DiffChanges>(),
  total: emptyDiffChanges(),
})

export const diffStatisticsCount = (
  stats: Readonly<DiffStatistics>,
  input: Readonly<{ file: string; change: DiffChange; amount?: number }>,
): DiffStatistics => {
  const amount = input.amount ?? ONE
  if (amount === ZERO) {
    return stats
  }
  const existing = MutableHashMap.get(stats.changesByFile, input.file)
  let base: DiffChanges
  if (Option.isSome(existing)) {
    base = existing.value
  } else {
    base = emptyDiffChanges()
  }
  let nextChanges: DiffChanges = base
  let nextTotal: DiffChanges = stats.total
  switch (input.change) {
    case 'added': {
      nextChanges = { added: base.added + amount, removed: base.removed }
      nextTotal = { added: stats.total.added + amount, removed: stats.total.removed }
      break
    }
    case 'removed': {
      nextChanges = { added: base.added, removed: base.removed + amount }
      nextTotal = { added: stats.total.added, removed: stats.total.removed + amount }
      break
    }
  }
  const nextMap = MutableHashMap.fromIterable(stats.changesByFile)
  MutableHashMap.set(nextMap, input.file, nextChanges)
  return { changesByFile: nextMap, total: nextTotal }
}

export const diffStatisticsDetailedReport = (stats: Readonly<DiffStatistics>): readonly string[] =>
  [...stats.changesByFile].map(([fileName, changes]) => `${fileName} ${diffChangesToString(changes)}`)

export const diffStatisticsTotalsReport = (stats: Readonly<DiffStatistics>): string =>
  `${MutableHashMap.size(stats.changesByFile)} files changed (${diffChangesToString(stats.total)})`

// ---------------------------------------------------------------------------
// Test coverage
// ---------------------------------------------------------------------------

export interface TestCoverage {
  readonly testsByMutantId: MutableHashMap.MutableHashMap<string, MutableHashSet.MutableHashSet<TestResult>>
  readonly testsById: MutableHashMap.MutableHashMap<string, TestResult>
  readonly staticCoverage: CoverageData | undefined
  readonly hitsByMutantId: MutableHashMap.MutableHashMap<string, number>
}

export const hasCoverage = (coverage: Readonly<TestCoverage>): boolean => !!coverage.staticCoverage

export const hasStaticCoverage = (
  coverage: Readonly<TestCoverage>,
  mutantId: string,
): boolean => {
  const count = coverage.staticCoverage?.[mutantId]
  return count !== undefined && count > 0
}

export const forMutant = (
  coverage: Readonly<TestCoverage>,
  mutantId: string,
): MutableHashSet.MutableHashSet<TestResult> | undefined => {
  const opt = MutableHashMap.get(coverage.testsByMutantId, mutantId)
  if (Option.isSome(opt)) return opt.value
  return undefined
}

export const addTest = (
  coverage: Readonly<TestCoverage>,
  testResult: TestResult,
): TestCoverage => {
  const nextTestsById = MutableHashMap.fromIterable(coverage.testsById)
  MutableHashMap.set(nextTestsById, testResult.id, testResult)
  return {
    testsByMutantId: coverage.testsByMutantId,
    testsById: nextTestsById,
    staticCoverage: coverage.staticCoverage,
    hitsByMutantId: coverage.hitsByMutantId,
  }
}

export const addCoverage = (
  coverage: Readonly<TestCoverage>,
  mutantId: string,
  testIds: readonly string[],
): TestCoverage => {
  const existingOpt = MutableHashMap.get(coverage.testsByMutantId, mutantId)
  let existing: MutableHashSet.MutableHashSet<TestResult> | undefined
  if (Option.isSome(existingOpt)) {
    existing = existingOpt.value
  } else {
    existing = undefined
  }
  let nextSet: MutableHashSet.MutableHashSet<TestResult>
  if (existing !== undefined) {
    nextSet = MutableHashSet.fromIterable(existing)
  } else {
    nextSet = MutableHashSet.empty<TestResult>()
  }
  for (const testId of testIds) {
    const testOpt = MutableHashMap.get(coverage.testsById, testId)
    if (Option.isSome(testOpt)) {
      MutableHashSet.add(nextSet, testOpt.value)
    }
  }
  if (existing !== undefined && MutableHashSet.size(nextSet) === MutableHashSet.size(existing)) {
    return coverage
  }
  const nextMap = MutableHashMap.fromIterable(coverage.testsByMutantId)
  MutableHashMap.set(nextMap, mutantId, nextSet)
  return {
    testsByMutantId: nextMap,
    testsById: coverage.testsById,
    staticCoverage: coverage.staticCoverage,
    hitsByMutantId: coverage.hitsByMutantId,
  }
}

export const testCoverageFrom = (
  result: Readonly<CompleteDryRunResult>,
): TestCoverage => {
  const hitsByMutantId: MutableHashMap.MutableHashMap<string, number> = MutableHashMap.empty<string, number>()
  const testsByMutantId: MutableHashMap.MutableHashMap<string, MutableHashSet.MutableHashSet<TestResult>> =
    MutableHashMap.empty()
  const testsById: MutableHashMap.MutableHashMap<string, TestResult> = MutableHashMap.empty()
  for (const test of result.tests) {
    MutableHashMap.set(testsById, test.id, test)
  }
  if (result.mutantCoverage) {
    for (const [testId, coverage] of Object.entries(result.mutantCoverage.perTest)) {
      const foundTestOpt = MutableHashMap.get(testsById, testId)
      if (Option.isNone(foundTestOpt)) {
        continue
      }
      const foundTest = foundTestOpt.value
      for (const [mutantId, count] of Object.entries(coverage)) {
        if (count > 0) {
          let covOpt = MutableHashMap.get(testsByMutantId, mutantId)
          let cov: MutableHashSet.MutableHashSet<TestResult>
          if (Option.isNone(covOpt)) {
            cov = MutableHashSet.empty<TestResult>()
            MutableHashMap.set(testsByMutantId, mutantId, cov)
          } else {
            cov = covOpt.value
          }
          MutableHashSet.add(cov, foundTest)
        }
      }
    }
    const coverageResultsPerMutant = [result.mutantCoverage.static, ...Object.values(result.mutantCoverage.perTest)]
    for (const coverageByMutantId of coverageResultsPerMutant) {
      for (const [mutantId, count] of Object.entries(coverageByMutantId)) {
        const existingOpt = MutableHashMap.get(hitsByMutantId, mutantId)
        let existing: number
        if (Option.isSome(existingOpt)) {
          existing = existingOpt.value
        } else {
          existing = 0
        }
        MutableHashMap.set(hitsByMutantId, mutantId, existing + count)
      }
    }
  }
  return {
    testsByMutantId,
    testsById,
    staticCoverage: result.mutantCoverage?.static,
    hitsByMutantId,
  }
}

// ---------------------------------------------------------------------------
// Mutant test planner (Cell sandwich)
// ---------------------------------------------------------------------------

export const calculateTotalTime = (testResults: Iterable<TestResult>): number =>
  [...testResults].reduce((acc, test) => acc + test.timeSpentMs, 0)

export const toTestIds = (testResults: Iterable<TestResult>): string[] => {
  const out: string[] = []
  for (const test of testResults) {
    out.push(test.id)
  }
  return out
}

const coverageToCommand = (
  mutants: readonly Mutant[],
  testCoverage: TestCoverage,
  options: { disableBail: boolean; timeoutMS: number; timeoutFactor: number; ignoreStatic: boolean },
  timeOverheadMS: number,
  globalTestFilter: string[] | undefined,
  sandboxFileByName: Record<string, string>,
): PlanMutantTestsCommand => {
  const hitsByMutantId: Record<string, number> = {}
  for (const [k, v] of testCoverage.hitsByMutantId) {
    hitsByMutantId[k] = v
  }

  const testsByMutantId: Record<string, string[]> = {}
  for (const [mutantId, tests] of testCoverage.testsByMutantId) {
    const ids: string[] = []
    for (const t of tests) {
      ids.push(t.id)
    }
    testsByMutantId[mutantId] = ids
  }

  const testTimeById: Record<string, number> = {}
  for (const [id, result] of testCoverage.testsById) {
    testTimeById[id] = result.timeSpentMs
  }

  const staticCoverage = testCoverage.staticCoverage

  let timeSpentAllTests = 0
  for (const result of MutableHashMap.values(testCoverage.testsById)) {
    timeSpentAllTests += result.timeSpentMs
  }

  return PlanMutantTestsCommand.make({
    mutants: [...mutants],
    timeOverheadMS,
    timeSpentAllTests,
    hitsByMutantId,
    testsByMutantId,
    testTimeById,
    options,
    sandboxFileByName,
    ...(staticCoverage !== undefined && { staticCoverage }),
    ...(globalTestFilter !== undefined && { globalTestFilter: [...globalTestFilter] }),
  })
}

interface PlannerPhases extends Cell.Phases {
  readonly command: PlanMutantTestsCommand
  readonly raw: PlanMutantTestsCommand
  readonly decoded: PlanMutantTestsCommand
  readonly decision: PlannedMutantTests
  readonly decisionError: PlanMutantTestsError
  readonly output: PlannedMutantTests
  readonly response: readonly TestPlan[]
  readonly decodeError: never
  readonly readError: never
  readonly writeError: never
}

// Not a decision: construction of the value the decision already described.
// Sited at the edge because a `Workflow.make` body may not reference an
// unsealed import like `Mutant`.
const materializeMutant = (
  original: Mutant,
  decided: {
    readonly status?: Mutant['status'] | undefined
    readonly statusReason?: string | undefined
    readonly static?: boolean | undefined
    readonly coveredBy?: readonly string[] | undefined
  },
): Mutant => {
  const status = decided.status ?? original.status
  const statusReason = decided.statusReason ?? original.statusReason
  const isStatic = decided.static ?? original.static
  const coveredBy = decided.coveredBy ?? original.coveredBy
  return new Mutant({
    id: original.id,
    fileName: original.fileName,
    mutatorName: original.mutatorName,
    replacement: original.replacement,
    location: original.location,
    ...(status !== undefined && { status }),
    ...(statusReason !== undefined && { statusReason }),
    ...(isStatic !== undefined && { static: isStatic }),
    ...(coveredBy !== undefined && { coveredBy: [...coveredBy] }),
    ...(original.testsCompleted !== undefined && { testsCompleted: original.testsCompleted }),
    ...(original.description !== undefined && { description: original.description }),
  })
}

// Not a decision: materializes the final `TestPlan` shape from the decision's
// data. The decision chose Run vs EarlyResult and every runOptions field;
// this builds the `Mutant` values it described.
const materializePlan = (plan: PlannedMutantTests['plans'][number], original: Mutant): TestPlan => {
  if (plan.plan === 'EarlyResult') {
    return { plan: 'EarlyResult', mutant: materializeMutant(original, plan) }
  }
  const mutant = materializeMutant(original, plan)
  return {
    plan: 'Run',
    mutant,
    netTime: plan.netTime,
    runOptions: {
      activeMutant: mutant,
      mutantActivation: plan.runOptions.mutantActivation,
      timeout: plan.runOptions.timeout,
      sandboxFileName: plan.runOptions.sandboxFileName,
      disableBail: plan.runOptions.disableBail,
      reloadEnvironment: plan.runOptions.reloadEnvironment,
      ...(plan.runOptions.testFilter !== undefined && { testFilter: [...plan.runOptions.testFilter] }),
      ...(plan.runOptions.hitLimit !== undefined && { hitLimit: plan.runOptions.hitLimit }),
    },
  }
}

const plannerDescription = pipe(
  Cell.read<PlannerPhases>((command: PlanMutantTestsCommand) => Effect.succeed(command)),
  Cell.decode<PlannerPhases>((raw: PlanMutantTestsCommand) => Result.succeed(raw)),
  Cell.decide<PlannerPhases>(planMutantTests),
  Cell.encode<PlannerPhases>((outcome: Result.Result<PlannedMutantTests, PlanMutantTestsError>) =>
    Result.match(outcome, {
      onFailure: () => PlannedMutantTests.make({ plans: [], totalNetTime: 0 }),
      onSuccess: (decision) => decision,
    })
  ),
  Cell.write<PlannerPhases>((output: PlannedMutantTests, raw: PlanMutantTestsCommand) => {
    const byId = new Map<string, Mutant>()
    for (const mutant of raw.mutants) {
      byId.set(mutant.id, mutant)
    }
    return Effect.forEach(output.plans, (plan) => {
      const original = byId.get(plan.mutantId)
      if (original === undefined) {
        return Effect.die(new Error(`planner returned an unknown mutant id: ${plan.mutantId}`))
      }
      return Effect.succeed(materializePlan(plan, original))
    })
  }),
)

export const makeMutantTestPlanner = (
  command: PlanMutantTestsCommand,
): Effect.Effect<readonly TestPlan[], never, never> => Cell.apply(plannerDescription, command)

export const plan = makeMutantTestPlanner

export const decidePlans = (
  mutants: readonly Mutant[],
  testCoverage: TestCoverage,
  options: { disableBail: boolean; timeoutMS: number; timeoutFactor: number; ignoreStatic: boolean },
  timeOverheadMS: number,
  globalTestFilter: string[] | undefined,
  sandboxFileByName: Record<string, string>,
): Effect.Effect<readonly TestPlan[], never, never> => {
  const command = coverageToCommand(
    mutants,
    testCoverage,
    options,
    timeOverheadMS,
    globalTestFilter,
    sandboxFileByName,
  )
  return makeMutantTestPlanner(command)
}

// ---------------------------------------------------------------------------
// Incremental differ (Cell sandwich + backwards compat)
// ---------------------------------------------------------------------------

export interface IncrementalDiffResult {
  readonly mutants: readonly Mutant[]
  readonly remembered: readonly {
    readonly mutantId: string
    readonly status: string
    readonly testsCompleted?: number | undefined
  }[]
  readonly mutantStatistics: DiffStatistics
  readonly testStatistics: DiffStatistics
}

const previousFilesOf = (rawReport: unknown): S.Schema.Type<typeof PreviousFilesSchema> => {
  if (typeof rawReport === 'object' && rawReport !== null && 'files' in rawReport) {
    const files = rawReport.files
    if (S.is(PreviousFilesSchema)(files)) return files
  }
  return {}
}

const previousTestFilesOf = (rawReport: unknown): S.Schema.Type<typeof PreviousTestFilesSchema> => {
  if (typeof rawReport === 'object' && rawReport !== null && 'testFiles' in rawReport) {
    const testFiles = rawReport.testFiles
    if (S.is(PreviousTestFilesSchema)(testFiles)) return testFiles
  }
  return {}
}
const testIdsByRelativeFile = (testCoverage: TestCoverage, basePath: string): Record<string, string[]> => {
  const byFile: Record<string, string[]> = {}
  for (const result of MutableHashMap.values(testCoverage.testsById)) {
    if (result.fileName === undefined) continue
    const file = toRelativeNormalizedFileName(result.fileName, basePath)
    byFile[file] = [...(byFile[file] ?? []), result.id]
  }
  return byFile
}

const coveringTestFilesByMutantId = (testCoverage: TestCoverage, basePath: string): Record<string, string[]> => {
  const byMutant: Record<string, string[]> = {}
  for (const mutantId of MutableHashMap.keys(testCoverage.testsByMutantId)) {
    const testsOpt = MutableHashMap.get(testCoverage.testsByMutantId, mutantId)
    if (Option.isNone(testsOpt)) continue
    const fileMap: Record<string, true> = {}
    for (const test of testsOpt.value) {
      if (test.fileName === undefined) continue
      fileMap[toRelativeNormalizedFileName(test.fileName, basePath)] = true
    }
    byMutant[mutantId] = Object.keys(fileMap)
  }
  return byMutant
}

export const incrementalDiff = (
  input: Readonly<{
    currentMutants: readonly Mutant[]
    testCoverage: TestCoverage
    incrementalReport: unknown
    currentRelativeFiles: Record<string, string>
    basePath: string
    force?: boolean
  }>,
): IncrementalDiffResult => {
  const command = IncrementalDiffCommand.make({
    basePath: input.basePath,
    currentMutants: [...input.currentMutants],
    previousFiles: previousFilesOf(input.incrementalReport),
    previousTestFiles: previousTestFilesOf(input.incrementalReport),
    currentRelativeFiles: input.currentRelativeFiles,
    testIdsByRelativeFile: testIdsByRelativeFile(input.testCoverage, input.basePath),
    coveringTestFilesByMutantId: coveringTestFilesByMutantId(input.testCoverage, input.basePath),
    force: input.force ?? false,
  })
  return Result.match(incrementalDifferWorkflow(command), {
    onSuccess: (decision) => ({
      mutants: decision.mutants,
      remembered: decision.remembered,
      mutantStatistics: {
        changesByFile: MutableHashMap.fromIterable(
          Object.entries(decision.mutantStatistics.changesByFile),
        ),
        total: decision.mutantStatistics.total,
      },
      testStatistics: {
        changesByFile: MutableHashMap.fromIterable(
          Object.entries(decision.testStatistics.changesByFile),
        ),
        total: decision.testStatistics.total,
      },
    }),
    onFailure: () => ({
      mutants: [...input.currentMutants],
      remembered: [],
      mutantStatistics: { changesByFile: MutableHashMap.empty<string, DiffChanges>(), total: { added: 0, removed: 0 } },
      testStatistics: { changesByFile: MutableHashMap.empty<string, DiffChanges>(), total: { added: 0, removed: 0 } },
    }),
  })
}
