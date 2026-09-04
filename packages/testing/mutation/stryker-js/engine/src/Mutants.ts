/// <reference types="vitest/import-meta" />
import * as Effect from 'effect/Effect'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as MutableHashSet from 'effect/MutableHashSet'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'

import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import type { CoverageData, TestPlan } from '@systemfsoftware/stryker-js/Mutant'
import type { CompleteDryRunResult, TestResult } from '@systemfsoftware/stryker-js/TestRunner'

import { toRelativeNormalizedFileName } from './IncrementalDiff.paths.js'
import {
  IncrementalDiffCommand,
  IncrementalDiffDecision,
  PlanMutantTestsCommand,
  PlannedMutantTests,
  type PreviousFile,
  PreviousFilesSchema,
  type PreviousMutant,
  type PreviousTestFile,
  PreviousTestFilesSchema,
  type RememberedMutant,
} from './Mutants.schema.js'

export const HIT_LIMIT_FACTOR = 100

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
type PlannedPlan = PlannedMutantTests['plans'][number]
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

const hasPlanCoverage = (staticCoverage: Record<string, number> | undefined): boolean => {
  if (staticCoverage === undefined) {
    return false
  }
  return Object.keys(staticCoverage).length > 0
}

const hasPlanStaticCoverage = (staticCoverage: Record<string, number> | undefined, mutantId: string): boolean => {
  if (staticCoverage === undefined) {
    return false
  }
  const count = staticCoverage[mutantId]
  if (count === undefined) {
    return false
  }
  return count > 0
}

const calculateTotalTimeForIds = (testIds: readonly string[], testTimeById: Record<string, number>): number =>
  testIds.reduce((acc, id) => {
    const t = testTimeById[id]
    if (t !== undefined) {
      return acc + t
    }
    return acc
  }, 0)

const getHitLimit = (hitCount: number | undefined): number | undefined => {
  if (hitCount === undefined) {
    return undefined
  }
  return hitCount * HIT_LIMIT_FACTOR
}

const getMutantActivation = (testFilter: readonly string[] | undefined): 'runtime' | 'static' => {
  if (testFilter !== undefined) {
    return 'runtime'
  }
  return 'static'
}

const getCoveredBy = (mutant: Mutant): string[] | undefined => {
  if (mutant.coveredBy === undefined) {
    return undefined
  }
  return [...mutant.coveredBy]
}

const getTestFilter = (globalFilter: readonly string[] | undefined): string[] | undefined => {
  if (globalFilter === undefined) {
    return undefined
  }
  return [...globalFilter]
}

const toRunPlan = (
  mutant: Mutant,
  command: PlanMutantTestsCommand,
  netTime: number,
  testFilter: readonly string[] | undefined,
  isStatic: boolean | undefined,
  coveredBy: readonly string[] | undefined,
): PlannedPlan => {
  const disableBail = command.options.disableBail
  const timeoutMS = command.options.timeoutMS
  const timeoutFactor = command.options.timeoutFactor
  const timeout = timeoutFactor * netTime + timeoutMS + command.timeOverheadMS
  const hitCount = command.hitsByMutantId[mutant.id]
  const hitLimit = getHitLimit(hitCount)
  const canHotSwap = testFilter !== undefined && isStatic === false
  const mutantActivation = getMutantActivation(testFilter)
  const reloadEnvironment = !canHotSwap
  return {
    plan: 'Run',
    mutantId: mutant.id,
    netTime,
    runOptions: {
      mutantActivation,
      timeout,
      sandboxFileName: command.sandboxFileByName[mutant.fileName] ?? mutant.fileName,
      disableBail,
      reloadEnvironment,
      ...(testFilter !== undefined && { testFilter: [...testFilter] }),
      ...(hitLimit !== undefined && { hitLimit }),
    },
    ...(isStatic !== undefined && { static: isStatic }),
    ...(coveredBy !== undefined && { coveredBy: [...coveredBy] }),
  }
}

const toEarlyResultPlan = (
  mutant: Mutant,
  isStatic: boolean | undefined,
  status: NonNullable<Mutant['status']>,
  statusReason: string | undefined,
  coveredBy: readonly string[] | undefined,
): PlannedPlan => ({
  plan: 'EarlyResult',
  mutantId: mutant.id,
  status,
  ...(statusReason !== undefined && { statusReason }),
  ...(statusReason === undefined && mutant.statusReason !== undefined && { statusReason: mutant.statusReason }),
  ...(isStatic !== undefined && { static: isStatic }),
  ...(coveredBy !== undefined && { coveredBy: [...coveredBy] }),
})

const decidePlanForMutant = (
  mutant: Mutant,
  command: PlanMutantTestsCommand,
): PlannedPlan => {
  const isStatic = hasPlanStaticCoverage(command.staticCoverage, mutant.id)
  if (mutant.status !== undefined) {
    const coveredBy = getCoveredBy(mutant)
    return toEarlyResultPlan(mutant, isStatic, mutant.status, mutant.statusReason, coveredBy)
  }
  if (hasPlanCoverage(command.staticCoverage)) {
    const tests = command.testsByMutantId[mutant.id] ?? []
    const coveredBy = [...tests]
    const ignoreStatic = command.options.ignoreStatic
    const shouldUseCovered = !isStatic || (ignoreStatic && coveredBy.length > 0)
    if (shouldUseCovered) {
      const netTime = calculateTotalTimeForIds(tests, command.testTimeById)
      return toRunPlan(mutant, command, netTime, coveredBy, isStatic, coveredBy)
    }
    if (ignoreStatic) {
      return toEarlyResultPlan(mutant, isStatic, 'Ignored', 'Static mutant (and "ignoreStatic" was enabled)', coveredBy)
    }
    const testFilter = getTestFilter(command.globalTestFilter)
    return toRunPlan(mutant, command, command.timeSpentAllTests, testFilter, isStatic, coveredBy)
  }
  const testFilter = getTestFilter(command.globalTestFilter)
  return toRunPlan(mutant, command, command.timeSpentAllTests, testFilter, undefined, undefined)
}

const decidePlanMutantTests = (
  command: PlanMutantTestsCommand,
): PlannedMutantTests => {
  const plans = command.mutants.map((mutant) => decidePlanForMutant(mutant, command))
  const totalNetTime = plans.reduce((acc, plan) => {
    if (plan.plan === 'Run') {
      return acc + plan.netTime
    }
    return acc
  }, 0)
  return PlannedMutantTests.make({
    plans,
    totalNetTime,
  })
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
const materializePlan = (plan: PlannedPlan, original: Mutant): TestPlan => {
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

export const makeMutantTestPlanner = (
  command: PlanMutantTestsCommand,
): Effect.Effect<readonly TestPlan[], never, never> => {
  const output = decidePlanMutantTests(command)
  const byId = new Map<string, Mutant>()
  for (const mutant of command.mutants) {
    byId.set(mutant.id, mutant)
  }
  return Effect.forEach(output.plans, (plan) => {
    const original = byId.get(plan.mutantId)
    if (original === undefined) {
      return Effect.die(new Error(`planner returned an unknown mutant id: ${plan.mutantId}`))
    }
    return Effect.succeed(materializePlan(plan, original))
  })
}

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

const REMEMBERED_STATUS: Record<string, true> = {
  Killed: true,
  Survived: true,
  Timeout: true,
  NoCoverage: true,
  Ignored: true,
}

type KeyLocation = { readonly line: number; readonly column: number }

const mutantKeyOf = (
  mutatorName: string,
  replacement: string,
  start: KeyLocation,
  end: KeyLocation,
): string => `${mutatorName}\u0000${replacement}\u0000${start.line}:${start.column}:${end.line}:${end.column}`

type KeyedMutant = {
  readonly mutatorName: string
  readonly replacement: string
  readonly location: { readonly start: KeyLocation; readonly end: KeyLocation }
}

const currentMutantKey = (mutant: KeyedMutant): string =>
  mutantKeyOf(mutant.mutatorName, mutant.replacement, mutant.location.start, mutant.location.end)

const previousMutantKey = (mutant: KeyedMutant): string =>
  mutantKeyOf(
    mutant.mutatorName,
    mutant.replacement,
    { line: mutant.location.start.line - 1, column: mutant.location.start.column - 1 },
    { line: mutant.location.end.line - 1, column: mutant.location.end.column - 1 },
  )

const changedSourceFiles = (
  previousFiles: Readonly<Record<string, PreviousFile>>,
  currentRelativeFiles: Readonly<Record<string, string>>,
): readonly string[] =>
  Object.entries(previousFiles)
    .filter(([name, previous]) => previous.source !== currentRelativeFiles[name])
    .map(([name]) => name)

const changedTestFiles = (
  previousTestFiles: Readonly<Record<string, PreviousTestFile>>,
  currentRelativeFiles: Readonly<Record<string, string>>,
  testIdsByRelativeFile: Readonly<Record<string, readonly string[]>>,
): readonly string[] =>
  Object.keys({ ...previousTestFiles, ...testIdsByRelativeFile }).filter(
    (name) => previousTestFiles[name]?.source !== currentRelativeFiles[name],
  )

const findRemembered = (
  previousFiles: Readonly<Record<string, PreviousFile>>,
  file: string,
  key: string,
): PreviousMutant | undefined => {
  const candidates = previousFiles[file]?.mutants ?? []
  return candidates.find((candidate) => previousMutantKey(candidate) === key)
}

const hasChangedCoverage = (
  mutantId: string,
  coveringTestFilesByMutantId: Readonly<Record<string, readonly string[]>>,
  changedTests: readonly string[],
): boolean => (coveringTestFilesByMutantId[mutantId] ?? []).some((file) => changedTests.includes(file))

const decideForMutant = (
  mutant: Mutant,
  command: IncrementalDiffCommand,
  changedFiles: readonly string[],
  changedTests: readonly string[],
): { readonly kind: 'run' } | { readonly kind: 'remembered'; readonly previous: PreviousMutant } => {
  const file = toRelativeNormalizedFileName(mutant.fileName, command.basePath)
  if (changedFiles.includes(file)) return { kind: 'run' }
  const previous = findRemembered(command.previousFiles, file, currentMutantKey(mutant))
  if (previous === undefined) return { kind: 'run' }
  if (REMEMBERED_STATUS[previous.status] !== true) return { kind: 'run' }
  if (hasChangedCoverage(mutant.id, command.coveringTestFilesByMutantId, changedTests)) return { kind: 'run' }
  return { kind: 'remembered', previous }
}

const countBy = (files: readonly string[]): Readonly<Record<string, number>> =>
  files.reduce<Record<string, number>>((acc, file) => {
    acc[file] = (acc[file] ?? 0) + 1
    return acc
  }, {})

const uniqueFiles = (files: readonly string[]): readonly string[] =>
  files.filter((file, index, all) => all.indexOf(file) === index)

const statisticsOf = (addedFiles: readonly string[], removedFiles: readonly string[]) => {
  const addedByFile = countBy(addedFiles)
  const removedByFile = countBy(removedFiles)
  const files = uniqueFiles([...Object.keys(addedByFile), ...Object.keys(removedByFile)])
  const changesByFile: Record<string, { added: number; removed: number }> = {}
  for (const file of files) {
    changesByFile[file] = { added: addedByFile[file] ?? 0, removed: removedByFile[file] ?? 0 }
  }
  const total = files.reduce(
    (acc, file) => ({ added: acc.added + (addedByFile[file] ?? 0), removed: acc.removed + (removedByFile[file] ?? 0) }),
    { added: 0, removed: 0 },
  )
  return { changesByFile, total }
}

const testStatisticsOf = (
  previousTestFiles: Readonly<Record<string, PreviousTestFile>>,
  testIdsByRelativeFile: Readonly<Record<string, readonly string[]>>,
) => {
  const currentTestFiles = Object.keys(testIdsByRelativeFile)
  const added = currentTestFiles.filter((name) => previousTestFiles[name] === undefined)
  const removed = Object.keys(previousTestFiles).filter((name) => testIdsByRelativeFile[name] === undefined)
  return statisticsOf(added, removed)
}

const removedMutantFiles = (
  command: IncrementalDiffCommand,
  currentKeysByFile: Readonly<Record<string, readonly string[]>>,
): readonly string[] =>
  Object.entries(command.previousFiles).flatMap(([file, previous]) => {
    const keys = currentKeysByFile[file]
    const removed = (previous.mutants ?? []).filter((candidate) => {
      if (keys === undefined) return true
      return !keys.includes(previousMutantKey(candidate))
    })
    return removed.map(() => file)
  })

const rememberedEntryOf = (mutant: Mutant, previous: PreviousMutant): RememberedMutant => {
  const entry: RememberedMutant = { mutantId: mutant.id, status: previous.status }
  if (previous.testsCompleted !== undefined) {
    Object.assign(entry, { testsCompleted: previous.testsCompleted })
  }
  if (previous.coveredBy !== undefined) {
    Object.assign(entry, { coveredBy: previous.coveredBy })
  }
  if (previous.killedBy !== undefined) {
    Object.assign(entry, { killedBy: previous.killedBy })
  }
  return entry
}

const decideIncremental = (
  command: IncrementalDiffCommand,
): IncrementalDiffDecision => {
  if (command.force) {
    const added = command.currentMutants.map((mutant) =>
      toRelativeNormalizedFileName(mutant.fileName, command.basePath)
    )
    return IncrementalDiffDecision.make({
      mutants: [...command.currentMutants],
      remembered: [],
      mutantStatistics: statisticsOf(added, []),
      testStatistics: testStatisticsOf(command.previousTestFiles, command.testIdsByRelativeFile),
    })
  }
  const changedFiles = changedSourceFiles(command.previousFiles, command.currentRelativeFiles)
  const changedTests = changedTestFiles(
    command.previousTestFiles,
    command.currentRelativeFiles,
    command.testIdsByRelativeFile,
  )
  const toRun: Mutant[] = []
  const remembered: RememberedMutant[] = []
  const addedFiles: string[] = []
  for (const mutant of command.currentMutants) {
    const decision = decideForMutant(mutant, command, changedFiles, changedTests)
    if (decision.kind === 'run') {
      toRun.push(mutant)
      addedFiles.push(toRelativeNormalizedFileName(mutant.fileName, command.basePath))
      continue
    }
    remembered.push(rememberedEntryOf(mutant, decision.previous))
  }
  const currentKeysByFile = command.currentMutants.reduce<Record<string, string[]>>((acc, mutant) => {
    const file = toRelativeNormalizedFileName(mutant.fileName, command.basePath)
    const keys = acc[file] ?? []
    acc[file] = [...keys, currentMutantKey(mutant)]
    return acc
  }, {})
  const removedFiles = removedMutantFiles(command, currentKeysByFile)
  return IncrementalDiffDecision.make({
    mutants: toRun,
    remembered,
    mutantStatistics: statisticsOf(addedFiles, removedFiles),
    testStatistics: testStatisticsOf(command.previousTestFiles, command.testIdsByRelativeFile),
  })
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
    readonly coveredBy?: readonly string[] | undefined
    readonly killedBy?: readonly string[] | undefined
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
  const decision = decideIncremental(command)
  return {
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
  }
}

if (import.meta.vitest !== void 0) {
  const { expect, it } = await import('vitest')

  it('Should_KeepKilledBy_When_BuildingARememberedEntry', () => {
    const location = { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } }
    const mutant = new Mutant({
      id: 'm1',
      fileName: '/proj/src/a.ts',
      mutatorName: 'BooleanLiteral',
      replacement: 'false',
      location,
    })
    const previous = {
      mutatorName: 'BooleanLiteral',
      replacement: 'false',
      location,
      status: 'Killed',
      killedBy: ['t1'],
      coveredBy: ['t1'],
    }
    expect(rememberedEntryOf(mutant, previous)).toEqual({
      mutantId: 'm1',
      status: 'Killed',
      killedBy: ['t1'],
      coveredBy: ['t1'],
    })
  })
}
