import assert from 'assert'

import {
  CompleteDryRunResult,
  DryRunResult,
  DryRunStatus,
  ErrorDryRunResult,
  ErrorMutantRunResult,
  KilledMutantRunResult,
  MutantRunResult,
  MutantRunStatus,
  SurvivedMutantRunResult,
  TestResult,
  TestStatus,
  TimeoutMutantRunResult,
} from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { expect } from 'vitest'

export function expectKilled(
  result: MutantRunResult,
): asserts result is KilledMutantRunResult {
  assert.strictEqual(
    result.status,
    MutantRunStatus.Killed,
    result.status === MutantRunStatus.Error ? result.errorMessage : '',
  )
}

export function expectTimeout(
  result: MutantRunResult,
): asserts result is TimeoutMutantRunResult {
  assert.strictEqual(result.status, MutantRunStatus.Timeout)
}

export function expectCompleted(
  runResult: DryRunResult,
): asserts runResult is CompleteDryRunResult {
  assert.strictEqual(
    runResult.status,
    DryRunStatus.Complete,
    runResult.status === DryRunStatus.Error
      ? runResult.errorMessage
      : 'Timeout occurred',
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
  assert.strictEqual(runResult.status, DryRunStatus.Error)
}

export function expectSurvived(
  runResult: MutantRunResult,
): asserts runResult is SurvivedMutantRunResult {
  assert.strictEqual(
    runResult.status,
    MutantRunStatus.Survived,
    runResult.status === MutantRunStatus.Error ? runResult.errorMessage : '',
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

  const actualPruned = pruneUnexpected(actual.tests, expectedTestResults)
  actualPruned.forEach((test) => {
    if (test.status === TestStatus.Failed && test.failureMessage) {
      const firstLineEnd = test.failureMessage.indexOf('\n')
      if (firstLineEnd !== -1) {
        test.failureMessage = test.failureMessage.substring(0, firstLineEnd)
      }
    }
  })
  sortTestResults(actualPruned)
  expectedTestResults.sort((a, b) => a.id.localeCompare(b.id))
  expect(actualPruned).toEqual(expectedTestResults)
}

export function sortTestResults(tests: PartialTestResult[]) {
  return tests.sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * Recursively prune unexpected values from an actual result. This will allow for a much cleaner chai diffing experience.
 * Will not mutate any given input, instead build a new output.
 * @param actual Some actual result you want to prune
 * @param expected Some expected result you want to match to
 * @returns A new `actual` object with all unexpected values pruned.
 */
function pruneUnexpected(
  actual: TestResult[],
  expected: PartialTestResult[],
): PartialTestResult[] {
  return actual.map(({ id, ...actualTestData }) => {
    const expectedTest = expected.find((test) => test.id === id)
    if (expectedTest) {
      return {
        id,
        ...Object.keys(expectedTest).reduce<Record<string, unknown>>((acc, key) => {
          const prop = key as keyof TestResult
          if (prop !== 'id') {
            acc[prop] = actualTestData[prop]
          }
          return acc
        }, {}),
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
