import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as MutableHashSet from 'effect/MutableHashSet'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as S from 'effect/Schema'

import type { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import type {
  Coverage,
  CoverageData,
  MutantStatus,
  TestPlan as MutantTestPlan,
} from '@systemfsoftware/stryker-js/Mutant'
import type { CompleteDryRunResult, TestResult } from '@systemfsoftware/stryker-js/TestRunner'

import { toRelativeNormalizedFileName } from './IncrementalDiff.paths.js'
import { PreviousFilesSchema, PreviousTestFilesSchema } from './IncrementalDiff.schema.js'
import type { PreviousFileRecord, PreviousMutantRecord, PreviousTestFileRecord } from './IncrementalDiff.schema.js'

export const HIT_LIMIT_FACTOR = 100

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

const firstDefined = <Value>(first: Value | undefined, second: Value | undefined): Value | undefined =>
  Option.getOrElse(Option.fromNullishOr(first), () => second)

const staticField = (isStatic: boolean | undefined): { readonly static?: boolean } =>
  Option.match(Option.fromUndefinedOr(isStatic), {
    onNone: () => ({}),
    onSome: (present) => ({ static: present }),
  })

const coveredByField = (coveredBy: readonly string[] | undefined): { readonly coveredBy?: readonly string[] } =>
  Option.match(Option.fromUndefinedOr(coveredBy), {
    onNone: () => ({}),
    onSome: (present) => ({ coveredBy: [...present] }),
  })

const testFilterField = (testFilter: readonly string[] | undefined): { readonly testFilter?: readonly string[] } =>
  Option.match(Option.fromUndefinedOr(testFilter), {
    onNone: () => ({}),
    onSome: (present) => ({ testFilter: [...present] }),
  })

export const emptyDiffChanges = (): DiffChanges => ({ added: ZERO, removed: ZERO })

export const diffChangesToString = (changes: Readonly<DiffChanges>): string => `+${changes.added} -${changes.removed}`

export const emptyDiffStatistics = (): DiffStatistics => ({
  changesByFile: MutableHashMap.empty<string, DiffChanges>(),
  total: emptyDiffChanges(),
})

const applyDiffChange = (
  stats: Readonly<DiffStatistics>,
  input: Readonly<{ file: string; change: DiffChange }>,
  amount: number,
): DiffStatistics => {
  const base = Option.getOrElse(MutableHashMap.get(stats.changesByFile, input.file), emptyDiffChanges)
  const next = Match.value(input.change).pipe(
    Match.when('added', () => ({
      changes: { added: base.added + amount, removed: base.removed },
      total: { added: stats.total.added + amount, removed: stats.total.removed },
    })),
    Match.when('removed', () => ({
      changes: { added: base.added, removed: base.removed + amount },
      total: { added: stats.total.added, removed: stats.total.removed + amount },
    })),
    Match.exhaustive,
  )
  const nextMap = MutableHashMap.fromIterable(stats.changesByFile)
  MutableHashMap.set(nextMap, input.file, next.changes)
  return { changesByFile: nextMap, total: next.total }
}

export const diffStatisticsCount = (
  stats: Readonly<DiffStatistics>,
  input: Readonly<{ file: string; change: DiffChange; amount?: number }>,
): DiffStatistics => {
  const amount = Option.getOrElse(Option.fromNullishOr(input.amount), () => ONE)
  return Match.value(amount).pipe(
    Match.when(ZERO, () => stats),
    Match.orElse(() => applyDiffChange(stats, input, amount)),
  )
}

export const diffStatisticsDetailedReport = (stats: Readonly<DiffStatistics>): readonly string[] =>
  [...stats.changesByFile].map(([fileName, changes]) => `${fileName} ${diffChangesToString(changes)}`)

export const diffStatisticsTotalsReport = (stats: Readonly<DiffStatistics>): string =>
  `${MutableHashMap.size(stats.changesByFile)} files changed (${diffChangesToString(stats.total)})`

export interface TestCoverage {
  readonly testsByMutantId: MutableHashMap.MutableHashMap<string, MutableHashSet.MutableHashSet<TestResult>>
  readonly testsById: MutableHashMap.MutableHashMap<string, TestResult>
  readonly staticCoverage: CoverageData | undefined
  readonly hitsByMutantId: MutableHashMap.MutableHashMap<string, number>
}

export const hasCoverage = (coverage: Readonly<TestCoverage>): boolean => !!coverage.staticCoverage

const staticCoverageCountOf = (
  staticCoverage: CoverageData | undefined,
  mutantId: string,
): number =>
  Option.getOrElse(
    Option.flatMap(Option.fromNullishOr(staticCoverage), (countsByMutantId) =>
      Option.fromUndefinedOr(countsByMutantId[mutantId])),
    () =>
      ZERO,
  )

export const hasStaticCoverage = (
  coverage: Readonly<TestCoverage>,
  mutantId: string,
): boolean => staticCoverageCountOf(coverage.staticCoverage, mutantId) > ZERO

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

const withMutantTests = (
  coverage: Readonly<TestCoverage>,
  mutantId: string,
  tests: MutableHashSet.MutableHashSet<TestResult>,
): TestCoverage => {
  const nextMap = MutableHashMap.fromIterable(coverage.testsByMutantId)
  MutableHashMap.set(nextMap, mutantId, tests)
  return {
    testsByMutantId: nextMap,
    testsById: coverage.testsById,
    staticCoverage: coverage.staticCoverage,
    hitsByMutantId: coverage.hitsByMutantId,
  }
}

export const addCoverage = (
  coverage: Readonly<TestCoverage>,
  mutantId: string,
  testIds: readonly string[],
): TestCoverage => {
  const existing = MutableHashMap.get(coverage.testsByMutantId, mutantId)
  const nextSet = Option.match(existing, {
    onNone: () => MutableHashSet.empty<TestResult>(),
    onSome: (tests) => MutableHashSet.fromIterable(tests),
  })
  for (const testId of testIds) {
    Option.match(MutableHashMap.get(coverage.testsById, testId), {
      onNone: () => undefined,
      onSome: (test) => MutableHashSet.add(nextSet, test),
    })
  }
  const unchanged = Option.exists(existing, (tests) => MutableHashSet.size(nextSet) === MutableHashSet.size(tests))
  return Match.value(unchanged).pipe(
    Match.when(true, () => coverage),
    Match.orElse(() => withMutantTests(coverage, mutantId, nextSet)),
  )
}

const testsByIdOf = (result: Readonly<CompleteDryRunResult>): MutableHashMap.MutableHashMap<string, TestResult> => {
  const testsById: MutableHashMap.MutableHashMap<string, TestResult> = MutableHashMap.empty()
  for (const test of result.tests) {
    MutableHashMap.set(testsById, test.id, test)
  }
  return testsById
}

const addTestsForMutant = (
  testsByMutantId: MutableHashMap.MutableHashMap<string, MutableHashSet.MutableHashSet<TestResult>>,
  mutantId: string,
  test: TestResult,
): void => {
  const existing = MutableHashMap.get(testsByMutantId, mutantId)
  const tests = Option.getOrElse(existing, () => MutableHashSet.empty<TestResult>())
  MutableHashSet.add(tests, test)
  if (Option.isNone(existing)) {
    MutableHashMap.set(testsByMutantId, mutantId, tests)
  }
}

const addTestCoverage = (
  testsByMutantId: MutableHashMap.MutableHashMap<string, MutableHashSet.MutableHashSet<TestResult>>,
  test: TestResult,
  coverage: CoverageData,
): void => {
  const coveredMutantIds = Object.entries(coverage)
    .filter(([, count]) => count > ZERO)
    .map(([mutantId]) => mutantId)
  for (const mutantId of coveredMutantIds) {
    addTestsForMutant(testsByMutantId, mutantId, test)
  }
}

const testsByMutantIdOf = (
  mutantCoverage: Coverage,
  testsById: MutableHashMap.MutableHashMap<string, TestResult>,
): MutableHashMap.MutableHashMap<string, MutableHashSet.MutableHashSet<TestResult>> => {
  const testsByMutantId: MutableHashMap.MutableHashMap<string, MutableHashSet.MutableHashSet<TestResult>> =
    MutableHashMap.empty()
  for (const [testId, coverage] of Object.entries(mutantCoverage.perTest)) {
    Option.match(MutableHashMap.get(testsById, testId), {
      onNone: () => undefined,
      onSome: (test) => addTestCoverage(testsByMutantId, test, coverage),
    })
  }
  return testsByMutantId
}

const addHits = (hitsByMutantId: MutableHashMap.MutableHashMap<string, number>, coverage: CoverageData): void => {
  for (const [mutantId, count] of Object.entries(coverage)) {
    const existing = Option.getOrElse(MutableHashMap.get(hitsByMutantId, mutantId), () => ZERO)
    MutableHashMap.set(hitsByMutantId, mutantId, existing + count)
  }
}

const hitsByMutantIdOf = (mutantCoverage: Coverage): MutableHashMap.MutableHashMap<string, number> => {
  const hitsByMutantId: MutableHashMap.MutableHashMap<string, number> = MutableHashMap.empty<string, number>()
  const coverageByMutantId = [mutantCoverage.static, ...Object.values(mutantCoverage.perTest)]
  for (const coverage of coverageByMutantId) {
    addHits(hitsByMutantId, coverage)
  }
  return hitsByMutantId
}

export const testCoverageFrom = (
  result: Readonly<CompleteDryRunResult>,
): TestCoverage => {
  const testsById = testsByIdOf(result)
  const mutantCoverage = Option.fromNullishOr(result.mutantCoverage)
  return {
    testsByMutantId: Option.match(mutantCoverage, {
      onNone: () => MutableHashMap.empty<string, MutableHashSet.MutableHashSet<TestResult>>(),
      onSome: (coverage) => testsByMutantIdOf(coverage, testsById),
    }),
    testsById,
    staticCoverage: Option.match(mutantCoverage, {
      onNone: () => undefined,
      onSome: (coverage) => coverage.static,
    }),
    hitsByMutantId: Option.match(mutantCoverage, {
      onNone: () => MutableHashMap.empty<string, number>(),
      onSome: (coverage) => hitsByMutantIdOf(coverage),
    }),
  }
}

export const calculateTotalTime = (testResults: Iterable<TestResult>): number =>
  [...testResults].reduce((acc, test) => acc + test.timeSpentMs, 0)

export const toTestIds = (testResults: Iterable<TestResult>): string[] => {
  const out: string[] = []
  for (const test of testResults) {
    out.push(test.id)
  }
  return out
}

export interface PlannerOptions {
  readonly disableBail: boolean
  readonly timeoutMS: number
  readonly timeoutFactor: number
  readonly ignoreStatic: boolean
}

export interface PlanMutantTestsInput {
  readonly mutants: readonly Mutant[]
  readonly timeOverheadMS: number
  readonly timeSpentAllTests: number
  readonly globalTestFilter?: readonly string[]
  readonly hitsByMutantId: Record<string, number>
  readonly staticCoverage?: Record<string, number>
  readonly testsByMutantId: Record<string, readonly string[]>
  readonly testTimeById: Record<string, number>
  readonly options: PlannerOptions
  readonly sandboxFileByName: Record<string, string>
}

export interface DecidedRunOptions {
  readonly mutantActivation: 'runtime' | 'static'
  readonly timeout: number
  readonly sandboxFileName: string
  readonly disableBail: boolean
  readonly reloadEnvironment: boolean
  readonly testFilter?: readonly string[]
  readonly hitLimit?: number
}

export interface RunTestPlan {
  readonly plan: 'Run'
  readonly mutantId: string
  readonly netTime: number
  readonly runOptions: DecidedRunOptions
  readonly static?: boolean
  readonly coveredBy?: readonly string[]
}

export interface EarlyResultTestPlan {
  readonly plan: 'EarlyResult'
  readonly mutantId: string
  readonly status: MutantStatus
  readonly statusReason?: string
  readonly static?: boolean
  readonly coveredBy?: readonly string[]
}

export type TestPlan = EarlyResultTestPlan | RunTestPlan

export interface PlannedTestPlans {
  readonly plans: readonly TestPlan[]
  readonly totalNetTime: number
}

const hasCoverageForPlan = (staticCoverage: Record<string, number> | undefined): boolean => {
  if (staticCoverage === undefined) {
    return false
  }
  return Object.keys(staticCoverage).length > 0
}

const hasStaticCoverageForPlan = (staticCoverage: Record<string, number> | undefined, mutantId: string): boolean =>
  staticCoverageCountOf(staticCoverage, mutantId) > ZERO

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
  command: PlanMutantTestsInput,
  netTime: number,
  testFilter: readonly string[] | undefined,
  isStatic: boolean | undefined,
  coveredBy: readonly string[] | undefined,
): RunTestPlan => {
  const timeout = command.options.timeoutFactor * netTime + command.options.timeoutMS + command.timeOverheadMS
  const hitLimit = getHitLimit(command.hitsByMutantId[mutant.id])
  const sandboxFileName = Option.getOrElse(
    Option.fromUndefinedOr(command.sandboxFileByName[mutant.fileName]),
    () => mutant.fileName,
  )
  const reloadEnvironment = Option.match(Option.fromUndefinedOr(testFilter), {
    onNone: () => true,
    onSome: () => isStatic !== false,
  })
  return {
    plan: 'Run',
    mutantId: mutant.id,
    netTime,
    runOptions: {
      mutantActivation: getMutantActivation(testFilter),
      timeout,
      sandboxFileName,
      disableBail: command.options.disableBail,
      reloadEnvironment,
      ...testFilterField(testFilter),
      ...Option.match(Option.fromUndefinedOr(hitLimit), {
        onNone: () => ({}),
        onSome: (limit) => ({ hitLimit: limit }),
      }),
    },
    ...staticField(isStatic),
    ...coveredByField(coveredBy),
  }
}

const toEarlyResultPlan = (
  mutant: Mutant,
  isStatic: boolean | undefined,
  status: MutantStatus,
  statusReason: string | undefined,
  coveredBy: readonly string[] | undefined,
): EarlyResultTestPlan => ({
  plan: 'EarlyResult',
  mutantId: mutant.id,
  status,
  ...Option.match(Option.fromUndefinedOr(firstDefined(statusReason, mutant.statusReason)), {
    onNone: () => ({}),
    onSome: (reason) => ({ statusReason: reason }),
  }),
  ...staticField(isStatic),
  ...coveredByField(coveredBy),
})

const planForStaticallyCovered = (
  mutant: Mutant,
  command: PlanMutantTestsInput,
  isStatic: boolean,
): TestPlan => {
  const tests = Option.getOrElse(Option.fromUndefinedOr(command.testsByMutantId[mutant.id]), () => [])
  const coveredBy = [...tests]
  const ignoreStatic = command.options.ignoreStatic
  const useCovered = Match.value(isStatic).pipe(
    Match.when(false, () => true),
    Match.orElse(() => ignoreStatic && tests.length > ZERO),
  )
  return Match.value(useCovered).pipe(
    Match.when(
      true,
      () =>
        toRunPlan(
          mutant,
          command,
          calculateTotalTimeForIds(tests, command.testTimeById),
          coveredBy,
          isStatic,
          coveredBy,
        ),
    ),
    Match.orElse(() =>
      Match.value(ignoreStatic).pipe(
        Match.when(true, () =>
          toEarlyResultPlan(mutant, isStatic, 'Ignored', 'Static mutant (and "ignoreStatic" was enabled)', coveredBy)),
        Match.orElse(() =>
          toRunPlan(
            mutant,
            command,
            command.timeSpentAllTests,
            getTestFilter(command.globalTestFilter),
            isStatic,
            coveredBy,
          )
        ),
      )
    ),
  )
}

const decidePlanForMutant = (
  mutant: Mutant,
  command: PlanMutantTestsInput,
): TestPlan => {
  const isStatic = hasStaticCoverageForPlan(command.staticCoverage, mutant.id)
  return Option.match(Option.fromUndefinedOr(mutant.status), {
    onSome: (status) => toEarlyResultPlan(mutant, isStatic, status, mutant.statusReason, getCoveredBy(mutant)),
    onNone: () =>
      Match.value(hasCoverageForPlan(command.staticCoverage)).pipe(
        Match.when(true, () => planForStaticallyCovered(mutant, command, isStatic)),
        Match.orElse(() =>
          toRunPlan(
            mutant,
            command,
            command.timeSpentAllTests,
            getTestFilter(command.globalTestFilter),
            undefined,
            undefined,
          )
        ),
      ),
  })
}

export const planMutantTests = (
  command: PlanMutantTestsInput,
): PlannedTestPlans => {
  const plans = command.mutants.map((mutant) => decidePlanForMutant(mutant, command))
  const totalNetTime = plans.reduce((acc, plan) => {
    if (plan.plan === 'Run') {
      return acc + plan.netTime
    }
    return acc
  }, 0)
  return {
    plans,
    totalNetTime,
  }
}

const hitsRecordOf = (testCoverage: TestCoverage): Record<string, number> => {
  const hitsByMutantId: Record<string, number> = {}
  for (const [mutantId, hits] of testCoverage.hitsByMutantId) {
    hitsByMutantId[mutantId] = hits
  }
  return hitsByMutantId
}

const testsByMutantIdRecordOf = (testCoverage: TestCoverage): Record<string, string[]> => {
  const testsByMutantId: Record<string, string[]> = {}
  for (const [mutantId, tests] of testCoverage.testsByMutantId) {
    testsByMutantId[mutantId] = toTestIds(tests)
  }
  return testsByMutantId
}

const testTimeRecordOf = (testCoverage: TestCoverage): Record<string, number> => {
  const testTimeById: Record<string, number> = {}
  for (const [id, result] of testCoverage.testsById) {
    testTimeById[id] = result.timeSpentMs
  }
  return testTimeById
}

const coverageToCommand = (
  mutants: readonly Mutant[],
  testCoverage: TestCoverage,
  options: { disableBail: boolean; timeoutMS: number; timeoutFactor: number; ignoreStatic: boolean },
  timeOverheadMS: number,
  globalTestFilter: string[] | undefined,
  sandboxFileByName: Record<string, string>,
): PlanMutantTestsInput => ({
  mutants: [...mutants],
  timeOverheadMS,
  timeSpentAllTests: calculateTotalTime(MutableHashMap.values(testCoverage.testsById)),
  hitsByMutantId: hitsRecordOf(testCoverage),
  testsByMutantId: testsByMutantIdRecordOf(testCoverage),
  testTimeById: testTimeRecordOf(testCoverage),
  options,
  sandboxFileByName,
  ...Option.match(Option.fromUndefinedOr(testCoverage.staticCoverage), {
    onNone: () => ({}),
    onSome: (staticCoverage) => ({ staticCoverage }),
  }),
  ...testFilterField(globalTestFilter),
})

const materializeMutant = (
  original: Mutant,
  decided: {
    readonly status?: Mutant['status'] | undefined
    readonly statusReason?: string | undefined
    readonly static?: boolean | undefined
    readonly coveredBy?: readonly string[] | undefined
  },
): Mutant => {
  const status = firstDefined(decided.status, original.status)
  const statusReason = firstDefined(decided.statusReason, original.statusReason)
  const isStatic = firstDefined(decided.static, original.static)
  const coveredBy = firstDefined(decided.coveredBy, original.coveredBy)
  return {
    _tag: 'Mutant',
    id: original.id,
    fileName: original.fileName,
    mutatorName: original.mutatorName,
    replacement: original.replacement,
    location: original.location,
    ...Option.match(Option.fromUndefinedOr(status), {
      onNone: () => ({}),
      onSome: (present) => ({ status: present }),
    }),
    ...Option.match(Option.fromUndefinedOr(statusReason), {
      onNone: () => ({}),
      onSome: (present) => ({ statusReason: present }),
    }),
    ...staticField(isStatic),
    ...coveredByField(coveredBy),
    ...Option.match(Option.fromUndefinedOr(original.testsCompleted), {
      onNone: () => ({}),
      onSome: (present) => ({ testsCompleted: present }),
    }),
    ...Option.match(Option.fromUndefinedOr(original.description), {
      onNone: () => ({}),
      onSome: (present) => ({ description: present }),
    }),
  }
}

const materializePlan = (plan: TestPlan, original: Mutant): MutantTestPlan => {
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
      ...testFilterField(plan.runOptions.testFilter),
      ...Option.match(Option.fromUndefinedOr(plan.runOptions.hitLimit), {
        onNone: () => ({}),
        onSome: (hitLimit) => ({ hitLimit }),
      }),
    },
  }
}

export const makeMutantTestPlanner = (
  command: PlanMutantTestsInput,
): Effect.Effect<readonly MutantTestPlan[], never, never> => {
  const { plans } = planMutantTests(command)
  const byId = new Map<string, Mutant>()
  for (const mutant of command.mutants) {
    byId.set(mutant.id, mutant)
  }
  return Effect.forEach(plans, (plan) => {
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
): Effect.Effect<readonly MutantTestPlan[], never, never> => {
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

export interface RememberedMutant {
  readonly mutantId: string
  readonly status: string
  readonly testsCompleted?: number | undefined
  readonly coveredBy?: readonly string[] | undefined
  readonly killedBy?: readonly string[] | undefined
}

export interface DiffStatisticsLike {
  readonly changesByFile: Record<string, { readonly added: number; readonly removed: number }>
  readonly total: { readonly added: number; readonly removed: number }
}

export interface IncrementalDiffInput {
  readonly basePath: string
  readonly currentMutants: readonly Mutant[]
  readonly previousFiles: Record<string, PreviousFileRecord>
  readonly previousTestFiles: Record<string, PreviousTestFileRecord>
  readonly currentRelativeFiles: Record<string, string>
  readonly testIdsByRelativeFile: Record<string, readonly string[]>
  readonly coveringTestFilesByMutantId: Record<string, readonly string[]>
  readonly force: boolean
}

export interface IncrementalDiffOutput {
  readonly mutants: readonly Mutant[]
  readonly remembered: readonly RememberedMutant[]
  readonly mutantStatistics: DiffStatisticsLike
  readonly testStatistics: DiffStatisticsLike
}

const REMEMBERED_STATUS: ReadonlySet<string> = new Set(['Killed', 'Survived', 'Timeout', 'NoCoverage', 'Ignored'])

const normalizeDiffFileName = (fileName: string): string => fileName.replaceAll('\\', '/')

const toRelativeNormalized = (fileName: string | undefined, basePath: string): string => {
  const raw = Option.getOrElse(Option.fromUndefinedOr(fileName), () => '')
  return Match.value(raw.startsWith(basePath)).pipe(
    Match.when(true, () => normalizeDiffFileName(raw.slice(basePath.length).replace(/^\/+/, ''))),
    Match.orElse(() => normalizeDiffFileName(raw)),
  )
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
  previousFiles: Readonly<Record<string, PreviousFileRecord>>,
  currentRelativeFiles: Readonly<Record<string, string>>,
): readonly string[] =>
  Object.entries(previousFiles)
    .filter(([name, previous]) => previous.source !== currentRelativeFiles[name])
    .map(([name]) => name)

const changedTestFiles = (
  previousTestFiles: Readonly<Record<string, PreviousTestFileRecord>>,
  currentRelativeFiles: Readonly<Record<string, string>>,
  testIdsByRelativeFile: Readonly<Record<string, readonly string[]>>,
): readonly string[] =>
  Object.keys({ ...previousTestFiles, ...testIdsByRelativeFile }).filter(
    (name) => previousTestFiles[name]?.source !== currentRelativeFiles[name],
  )

const NO_PREVIOUS_MUTANTS: readonly PreviousMutantRecord[] = []

const findRemembered = (
  previousFiles: Readonly<Record<string, PreviousFileRecord>>,
  file: string,
  key: string,
): PreviousMutantRecord | undefined => {
  const candidates = Option.getOrElse(
    Option.flatMap(Option.fromUndefinedOr(previousFiles[file]), (record) => Option.fromUndefinedOr(record.mutants)),
    () => NO_PREVIOUS_MUTANTS,
  )
  return candidates.find((candidate) => previousMutantKey(candidate) === key)
}

const hasChangedCoverage = (
  mutantId: string,
  coveringTestFilesByMutantId: Readonly<Record<string, readonly string[]>>,
  changedTests: readonly string[],
): boolean => (coveringTestFilesByMutantId[mutantId] ?? []).some((file) => changedTests.includes(file))

type MutantDecision =
  | { readonly kind: 'run' }
  | { readonly kind: 'remembered'; readonly previous: PreviousMutantRecord }

const isRememberable = (
  previous: PreviousMutantRecord,
  mutant: Mutant,
  input: IncrementalDiffInput,
  file: string,
  changedFiles: readonly string[],
  changedTests: readonly string[],
): boolean =>
  Match.value(REMEMBERED_STATUS.has(previous.status)).pipe(
    Match.when(false, () => false),
    Match.orElse(() =>
      Match.value(changedFiles.includes(file)).pipe(
        Match.when(true, () => false),
        Match.orElse(() => !hasChangedCoverage(mutant.id, input.coveringTestFilesByMutantId, changedTests)),
      )
    ),
  )

const decideForMutant = (
  mutant: Mutant,
  input: IncrementalDiffInput,
  changedFiles: readonly string[],
  changedTests: readonly string[],
): MutantDecision => {
  const file = toRelativeNormalized(mutant.fileName, input.basePath)
  const previous = findRemembered(input.previousFiles, file, currentMutantKey(mutant))
  return Option.match(
    Option.filter(
      Option.fromUndefinedOr(previous),
      (candidate) => isRememberable(candidate, mutant, input, file, changedFiles, changedTests),
    ),
    {
      onNone: () => ({ kind: 'run' }),
      onSome: (present) => ({ kind: 'remembered', previous: present }),
    },
  )
}

const countBy = (files: readonly string[]): Readonly<Record<string, number>> =>
  files.reduce<Record<string, number>>((acc, file) => {
    acc[file] = (acc[file] ?? 0) + 1
    return acc
  }, {})

const uniqueFiles = (files: readonly string[]): readonly string[] =>
  files.filter((file, index, all) => all.indexOf(file) === index)

const countOf = (counts: Readonly<Record<string, number>>, file: string): number =>
  Option.getOrElse(Option.fromUndefinedOr(counts[file]), () => ZERO)

const statisticsOf = (addedFiles: readonly string[], removedFiles: readonly string[]) => {
  const addedByFile = countBy(addedFiles)
  const removedByFile = countBy(removedFiles)
  const files = uniqueFiles([...Object.keys(addedByFile), ...Object.keys(removedByFile)])
  const changesByFile: Record<string, { added: number; removed: number }> = {}
  for (const file of files) {
    changesByFile[file] = { added: countOf(addedByFile, file), removed: countOf(removedByFile, file) }
  }
  const total = files.reduce(
    (acc, file) => ({
      added: acc.added + countOf(addedByFile, file),
      removed: acc.removed + countOf(removedByFile, file),
    }),
    { added: ZERO, removed: ZERO },
  )
  return { changesByFile, total }
}

const testStatisticsOf = (
  previousTestFiles: Readonly<Record<string, PreviousTestFileRecord>>,
  testIdsByRelativeFile: Readonly<Record<string, readonly string[]>>,
) => {
  const currentTestFiles = Object.keys(testIdsByRelativeFile)
  const added = currentTestFiles.filter((name) => previousTestFiles[name] === undefined)
  const removed = Object.keys(previousTestFiles).filter((name) => testIdsByRelativeFile[name] === undefined)
  return statisticsOf(added, removed)
}

const removedMutantFiles = (
  input: IncrementalDiffInput,
  currentKeysByFile: Readonly<Record<string, readonly string[]>>,
): readonly string[] =>
  Object.entries(input.previousFiles).flatMap(([file, previous]) => {
    const keys = currentKeysByFile[file]
    const removed = (previous.mutants ?? []).filter((candidate) => {
      if (keys === undefined) return true
      return !keys.includes(previousMutantKey(candidate))
    })
    return removed.map(() => file)
  })

const rememberedEntryOf = (mutant: Mutant, previous: PreviousMutantRecord): RememberedMutant => ({
  mutantId: mutant.id,
  status: previous.status,
  ...Option.match(Option.fromUndefinedOr(previous.testsCompleted), {
    onNone: () => ({}),
    onSome: (testsCompleted) => ({ testsCompleted }),
  }),
  ...Option.match(Option.fromUndefinedOr(previous.coveredBy), {
    onNone: () => ({}),
    onSome: (coveredBy) => ({ coveredBy }),
  }),
  ...Option.match(Option.fromUndefinedOr(previous.killedBy), {
    onNone: () => ({}),
    onSome: (killedBy) => ({ killedBy }),
  }),
})

const forcedDiff = (input: IncrementalDiffInput): IncrementalDiffOutput => {
  const added = input.currentMutants.map((mutant) => toRelativeNormalizedFileName(mutant.fileName, input.basePath))
  return {
    mutants: [...input.currentMutants],
    remembered: [],
    mutantStatistics: statisticsOf(added, []),
    testStatistics: testStatisticsOf(input.previousTestFiles, input.testIdsByRelativeFile),
  }
}

interface RememberedDecisionEntry {
  readonly mutant: Mutant
  readonly decision: { readonly kind: 'remembered'; readonly previous: PreviousMutantRecord }
}

const isRememberedEntry = (entry: {
  readonly mutant: Mutant
  readonly decision: MutantDecision
}): entry is RememberedDecisionEntry => entry.decision.kind === 'remembered'

const splitMutants = (
  input: IncrementalDiffInput,
  changedFiles: readonly string[],
  changedTests: readonly string[],
): {
  readonly toRun: readonly Mutant[]
  readonly addedFiles: readonly string[]
  readonly remembered: readonly RememberedMutant[]
} => {
  const decisions = input.currentMutants.map((mutant) => ({
    mutant,
    decision: decideForMutant(mutant, input, changedFiles, changedTests),
  }))
  const toRun = decisions.filter(({ decision }) => decision.kind === 'run').map(({ mutant }) => mutant)
  const addedFiles = toRun.map((mutant) => toRelativeNormalizedFileName(mutant.fileName, input.basePath))
  const remembered = decisions
    .filter(isRememberedEntry)
    .map(({ mutant, decision }) => rememberedEntryOf(mutant, decision.previous))
  return { toRun, addedFiles, remembered }
}

const incrementalDiffOfChanges = (input: IncrementalDiffInput): IncrementalDiffOutput => {
  const changedFiles = changedSourceFiles(input.previousFiles, input.currentRelativeFiles)
  const changedTests = changedTestFiles(
    input.previousTestFiles,
    input.currentRelativeFiles,
    input.testIdsByRelativeFile,
  )
  const { toRun, addedFiles, remembered } = splitMutants(input, changedFiles, changedTests)
  const currentKeysByFile = input.currentMutants.reduce<Record<string, string[]>>((acc, mutant) => {
    const file = toRelativeNormalizedFileName(mutant.fileName, input.basePath)
    const keys = acc[file] ?? []
    acc[file] = [...keys, currentMutantKey(mutant)]
    return acc
  }, {})
  const removedFiles = removedMutantFiles(input, currentKeysByFile)
  return {
    mutants: toRun,
    remembered,
    mutantStatistics: statisticsOf(addedFiles, removedFiles),
    testStatistics: testStatisticsOf(input.previousTestFiles, input.testIdsByRelativeFile),
  }
}

export const computeIncrementalDiff = (
  input: IncrementalDiffInput,
): IncrementalDiffOutput =>
  Match.value(input.force).pipe(
    Match.when(true, () => forcedDiff(input)),
    Match.orElse(() => incrementalDiffOfChanges(input)),
  )

const previousFilesOf = (rawReport: unknown): S.Schema.Type<typeof PreviousFilesSchema> =>
  Match.value(rawReport).pipe(
    Match.when(Predicate.isObject, (report) =>
      Option.getOrElse(
        Option.filter(Option.fromUndefinedOr(report['files']), S.is(PreviousFilesSchema)),
        () => ({}),
      )),
    Match.orElse(() => ({})),
  )

const previousTestFilesOf = (rawReport: unknown): S.Schema.Type<typeof PreviousTestFilesSchema> =>
  Match.value(rawReport).pipe(
    Match.when(Predicate.isObject, (report) =>
      Option.getOrElse(
        Option.filter(Option.fromUndefinedOr(report['testFiles']), S.is(PreviousTestFilesSchema)),
        () => ({}),
      )),
    Match.orElse(() => ({})),
  )
const hasTestFileName = (result: TestResult): result is TestResult & { readonly fileName: string } =>
  result.fileName !== undefined

const testIdsByRelativeFile = (testCoverage: TestCoverage, basePath: string): Record<string, string[]> => {
  const byFile: Record<string, string[]> = {}
  const located = [...MutableHashMap.values(testCoverage.testsById)].filter(hasTestFileName)
  for (const result of located) {
    const file = toRelativeNormalizedFileName(result.fileName, basePath)
    const ids: string[] = Option.getOrElse(Option.fromUndefinedOr(byFile[file]), () => [])
    ids.push(result.id)
    byFile[file] = ids
  }
  return byFile
}

const coveredTestFiles = (tests: Iterable<TestResult>, basePath: string): string[] => {
  const byFile: Record<string, true> = {}
  const located = [...tests].filter(hasTestFileName)
  for (const test of located) {
    byFile[toRelativeNormalizedFileName(test.fileName, basePath)] = true
  }
  return Object.keys(byFile)
}

const coveringTestFilesByMutantId = (testCoverage: TestCoverage, basePath: string): Record<string, string[]> => {
  const byMutant: Record<string, string[]> = {}
  for (const [mutantId, tests] of testCoverage.testsByMutantId) {
    byMutant[mutantId] = coveredTestFiles(tests, basePath)
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
  const output = computeIncrementalDiff({
    basePath: input.basePath,
    currentMutants: [...input.currentMutants],
    previousFiles: previousFilesOf(input.incrementalReport),
    previousTestFiles: previousTestFilesOf(input.incrementalReport),
    currentRelativeFiles: input.currentRelativeFiles,
    testIdsByRelativeFile: testIdsByRelativeFile(input.testCoverage, input.basePath),
    coveringTestFilesByMutantId: coveringTestFilesByMutantId(input.testCoverage, input.basePath),
    force: input.force ?? false,
  })
  return {
    mutants: output.mutants,
    remembered: output.remembered,
    mutantStatistics: {
      changesByFile: MutableHashMap.fromIterable(
        Object.entries(output.mutantStatistics.changesByFile),
      ),
      total: output.mutantStatistics.total,
    },
    testStatistics: {
      changesByFile: MutableHashMap.fromIterable(
        Object.entries(output.testStatistics.changesByFile),
      ),
      total: output.testStatistics.total,
    },
  }
}
