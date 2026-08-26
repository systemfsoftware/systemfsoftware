import assert from 'assert'

import {
  CompleteDryRunResult,
  DryRunResult,
  ErrorDryRunResult,
  ErrorMutantRunResult,
  KilledMutantRunResult,
  MutantRunResult,
  SurvivedMutantRunResult,
  TestResult,
  TimeoutMutantRunResult,
} from '@systemfsoftware/stryker-js/TestRunner'
import { expect } from 'vitest'

export function expectKilled(
  result: MutantRunResult,
): asserts result is KilledMutantRunResult {
  assert.strictEqual(
    result.status,
    'killed',
    (() => {
      if (result.status === 'error') return result.errorMessage
      return ''
    })(),
  )
}

export function expectTimeout(
  result: MutantRunResult,
): asserts result is TimeoutMutantRunResult {
  assert.strictEqual(result.status, 'timeout')
}

export function expectCompleted(
  runResult: DryRunResult,
): asserts runResult is CompleteDryRunResult {
  assert.strictEqual(
    runResult.status,
    'complete',
    (() => {
      if (runResult.status === 'error') return runResult.errorMessage
      return 'Timeout occurred'
    })(),
  )
}

export function expectErrored(
  runResult: MutantRunResult,
): asserts runResult is ErrorMutantRunResult
export function expectErrored(
  runResult: DryRunResult,
): asserts runResult is ErrorDryRunResult
export function expectErrored(
  runResult: DryRunResult | MutantRunResult,
): asserts runResult is ErrorDryRunResult | MutantRunResult
export function expectErrored(runResult: DryRunResult | MutantRunResult): void {
  assert.strictEqual(runResult.status, 'error')
}

export function expectSurvived(
  runResult: MutantRunResult,
): asserts runResult is SurvivedMutantRunResult {
  assert.strictEqual(
    runResult.status,
    'survived',
    (() => {
      if (runResult.status === 'error') return runResult.errorMessage
      return ''
    })(),
  )
}

type PartialTestResult = Partial<TestResult> & Pick<TestResult, 'id'>

/**
 * Compares test results while trimming failure messages to their first line (no stack traces)
 */
export function expectTestResults(
  actual: DryRunResult,
  expectedTestResults: PartialTestResult[],
): void {
  expectCompleted(actual)

  const actualPruned = pruneUnexpected([...actual.tests], expectedTestResults)
  const mutablePruned = actualPruned.map((test) => ({ ...test }))
  mutablePruned.forEach((test) => {
    if (test.status === 'failed' && test.failureMessage !== undefined && test.failureMessage.length > 0) {
      const firstLineEnd = test.failureMessage.indexOf('\n')
      if (firstLineEnd !== -1) {
        test.failureMessage = test.failureMessage.substring(0, firstLineEnd)
      }
    }
  })
  const sortedActual = sortTestResults(mutablePruned)
  const sortedExpected = sortTestResults(expectedTestResults)
  expect(sortedActual).toEqual(sortedExpected)
}
export function sortTestResults(tests: readonly PartialTestResult[]): PartialTestResult[] {
  return [...tests].sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * Recursively prune unexpected values from an actual result. This will allow for a much cleaner chai diffing experience.
 * Will not mutate any given input, instead build a new output.
 */
function pruneUnexpected(
  actual: readonly TestResult[],
  expected: readonly PartialTestResult[],
): PartialTestResult[] {
  return actual.map(({ id, ...actualTestData }) => {
    const expectedTest = expected.find((test) => test.id === id)
    if (expectedTest) {
      return {
        id,
        // Prune to exactly the expected keys: anything else in the actual
        // result only adds diff noise when the comparison fails.
        ...Object.fromEntries(
          Object.entries(actualTestData).filter(
            ([key]) => key in expectedTest && key !== 'id',
          ),
        ),
      }
    } else {
      // Test will fail, because expected does not exist,
      // but we still want to see the actual result in the diff
      return {
        id,
        ...actualTestData,
      }
    }
  })
}
