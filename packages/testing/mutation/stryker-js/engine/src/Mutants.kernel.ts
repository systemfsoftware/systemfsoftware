import type { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import type { MutantStatus } from '@systemfsoftware/stryker-js/Mutant'

const HIT_LIMIT_FACTOR = 100

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

const hasCoverage = (staticCoverage: Record<string, number> | undefined): boolean => {
  if (staticCoverage === undefined) {
    return false
  }
  return Object.keys(staticCoverage).length > 0
}

const hasStaticCoverage = (staticCoverage: Record<string, number> | undefined, mutantId: string): boolean => {
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
  command: PlanMutantTestsInput,
  netTime: number,
  testFilter: readonly string[] | undefined,
  isStatic: boolean | undefined,
  coveredBy: readonly string[] | undefined,
): RunTestPlan => {
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
  status: MutantStatus,
  statusReason: string | undefined,
  coveredBy: readonly string[] | undefined,
): EarlyResultTestPlan => ({
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
  command: PlanMutantTestsInput,
): TestPlan => {
  const isStatic = hasStaticCoverage(command.staticCoverage, mutant.id)
  if (mutant.status !== undefined) {
    const coveredBy = getCoveredBy(mutant)
    return toEarlyResultPlan(mutant, isStatic, mutant.status, mutant.statusReason, coveredBy)
  }
  if (hasCoverage(command.staticCoverage)) {
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
