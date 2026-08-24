import {
  type Mutant,
  type MutantEarlyResultPlan,
  type MutantRunPlan,
  type MutantStatus,
  type MutantTestPlan,
  PlanKind,
  type StrykerOptions,
} from '@systemfsoftware/stryker-js-plugin-api/core'
import type { TestResult } from '@systemfsoftware/stryker-js-plugin-api/test-runner'

import { hasCoverage, hasStaticCoverage, type TestCoverage } from './test-coverage.js'

export const HIT_LIMIT_FACTOR = 100

export function calculateTotalTime(testResults: Iterable<TestResult>): number {
  let total = 0
  for (const test of testResults) {
    total += test.timeSpentMs
  }
  return total
}

export function toTestIds(testResults: Iterable<TestResult>): string[] {
  const result: string[] = []
  for (const test of testResults) {
    result.push(test.id)
  }
  return result
}

export function decidePlanForMutant(
  mutant: Mutant,
  testCoverage: TestCoverage,
  options: StrykerOptions,
  timeOverheadMS: number,
  timeSpentAllTests: number,
  globalTestFilter: string[] | undefined,
): MutantTestPlan {
  const isStatic = hasStaticCoverage(testCoverage, mutant.id)

  if (mutant.status) {
    return createMutantEarlyResultPlan(mutant, {
      isStatic,
      ...(mutant.coveredBy === undefined ? {} : { coveredBy: mutant.coveredBy }),
      ...(mutant.killedBy === undefined ? {} : { killedBy: mutant.killedBy }),
      status: mutant.status,
      ...(mutant.statusReason === undefined ? {} : { statusReason: mutant.statusReason }),
    })
  }
  if (hasCoverage(testCoverage)) {
    const tests = testCoverage.testsByMutantId.get(mutant.id) ?? []
    const coveredBy = toTestIds(tests)
    if (!isStatic || (options.ignoreStatic && coveredBy.length)) {
      const netTime = calculateTotalTime(tests)
      return createMutantRunPlan(mutant, testCoverage, options, timeOverheadMS, {
        netTime,
        coveredBy,
        isStatic,
        testFilter: coveredBy,
      })
    }
    if (options.ignoreStatic) {
      return createMutantEarlyResultPlan(mutant, {
        status: 'Ignored',
        statusReason: 'Static mutant (and "ignoreStatic" was enabled)',
        isStatic,
        coveredBy,
      })
    }
    return createMutantRunPlan(mutant, testCoverage, options, timeOverheadMS, {
      netTime: timeSpentAllTests,
      isStatic,
      coveredBy,
      testFilter: globalTestFilter,
    })
  }
  return createMutantRunPlan(mutant, testCoverage, options, timeOverheadMS, {
    netTime: timeSpentAllTests,
    testFilter: globalTestFilter,
  })
}

function createMutantEarlyResultPlan(
  mutant: Mutant,
  {
    isStatic,
    status,
    statusReason,
    coveredBy,
    killedBy,
  }: {
    isStatic: boolean | undefined
    status: MutantStatus
    statusReason?: string
    coveredBy?: string[]
    killedBy?: string[]
  },
): MutantEarlyResultPlan {
  return {
    plan: PlanKind.EarlyResult,
    mutant: {
      ...mutant,
      status,
      ...(isStatic === undefined ? {} : { static: isStatic }),
      ...(statusReason === undefined ? {} : { statusReason }),
      ...(coveredBy === undefined ? {} : { coveredBy }),
      ...(killedBy === undefined ? {} : { killedBy }),
    },
  }
}

function createMutantRunPlan(
  mutant: Mutant,
  testCoverage: TestCoverage,
  options: StrykerOptions,
  timeOverheadMS: number,
  {
    netTime,
    testFilter,
    isStatic,
    coveredBy,
  }: {
    netTime: number
    testFilter?: string[] | undefined
    isStatic?: boolean | undefined
    coveredBy?: string[] | undefined
  },
): MutantRunPlan {
  const { disableBail, timeoutMS, timeoutFactor } = options
  const timeout = timeoutFactor * netTime + timeoutMS + timeOverheadMS
  const hitCount = testCoverage.hitsByMutantId.get(mutant.id)
  const hitLimit = hitCount === undefined ? undefined : hitCount * HIT_LIMIT_FACTOR
  const canHotSwap = !!testFilter && isStatic === false
  return {
    plan: PlanKind.Run,
    netTime,
    mutant: {
      ...mutant,
      ...(isStatic === undefined ? {} : { static: isStatic }),
      ...(coveredBy === undefined ? {} : { coveredBy }),
    },
    runOptions: {
      activeMutant: {
        id: mutant.id,
        fileName: mutant.fileName,
        location: mutant.location,
        mutatorName: mutant.mutatorName,
        replacement: mutant.replacement,
      },
      mutantActivation: testFilter ? 'runtime' : 'static',
      timeout,
      ...(testFilter === undefined ? {} : { testFilter }),
      sandboxFileName: '',
      ...(hitLimit === undefined ? {} : { hitLimit }),
      disableBail,
      reloadEnvironment: !canHotSwap,
    },
  }
}

export function decidePlans(
  mutants: readonly Mutant[],
  testCoverage: TestCoverage,
  options: StrykerOptions,
  timeOverheadMS: number,
  globalTestFilter: string[] | undefined,
  sandboxFileFor: (fileName: string) => string,
): readonly MutantTestPlan[] {
  const timeSpentAllTests = calculateTotalTime(testCoverage.testsById.values())
  return mutants.map((mutant) => {
    const base = decidePlanForMutant(mutant, testCoverage, options, timeOverheadMS, timeSpentAllTests, globalTestFilter)
    if (base.plan === PlanKind.Run) {
      return {
        ...base,
        runOptions: {
          ...base.runOptions,
          sandboxFileName: sandboxFileFor(mutant.fileName),
        },
      }
    }
    return base
  })
}
