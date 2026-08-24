import type { CoverageData } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import type { CompleteDryRunResult, TestResult } from '@systemfsoftware/stryker-js-plugin-api/test-runner'

export interface TestCoverage {
  readonly testsByMutantId: ReadonlyMap<string, ReadonlySet<TestResult>>
  readonly testsById: ReadonlyMap<string, TestResult>
  readonly staticCoverage: CoverageData | undefined
  readonly hitsByMutantId: ReadonlyMap<string, number>
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
): ReadonlySet<TestResult> | undefined => coverage.testsByMutantId.get(mutantId)

export const addTest = (
  coverage: Readonly<TestCoverage>,
  testResult: TestResult,
): TestCoverage => {
  const nextTestsById = new Map(coverage.testsById)
  nextTestsById.set(testResult.id, testResult)
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
  const existing = coverage.testsByMutantId.get(mutantId)
  const nextSet = new Set(existing ?? [])
  for (const testId of testIds) {
    const test = coverage.testsById.get(testId)
    if (test !== undefined) {
      nextSet.add(test)
    }
  }
  if (existing !== undefined && nextSet.size === existing.size) {
    return coverage
  }
  const nextMap = new Map(coverage.testsByMutantId)
  nextMap.set(mutantId, nextSet)
  return {
    testsByMutantId: nextMap,
    testsById: coverage.testsById,
    staticCoverage: coverage.staticCoverage,
    hitsByMutantId: coverage.hitsByMutantId,
  }
}

export const testCoverageFrom = (
  result: Readonly<CompleteDryRunResult>,
  logger: Logger,
): TestCoverage => {
  const hitsByMutantId = new Map<string, number>()
  const testsByMutantId = new Map<string, Set<TestResult>>()
  const testsById = result.tests.reduce(
    (acc, test) => acc.set(test.id, test),
    new Map<string, TestResult>(),
  )
  if (result.mutantCoverage) {
    for (const [testId, coverage] of Object.entries(result.mutantCoverage.perTest)) {
      const foundTest = testsById.get(testId)
      if (!foundTest) {
        logger.warn(
          `Found test with id "${testId}" in coverage data, but not in the test results of the dry run. Not taking coverage data for this test into account.`,
        )
        continue
      }
      for (const [mutantId, count] of Object.entries(coverage)) {
        if (count > 0) {
          let cov = testsByMutantId.get(mutantId)
          if (!cov) {
            cov = new Set()
            testsByMutantId.set(mutantId, cov)
          }
          cov.add(foundTest)
        }
      }
    }
    const coverageResultsPerMutant = [result.mutantCoverage.static, ...Object.values(result.mutantCoverage.perTest)]
    for (const coverageByMutantId of coverageResultsPerMutant) {
      for (const [mutantId, count] of Object.entries(coverageByMutantId)) {
        const existing = hitsByMutantId.get(mutantId) ?? 0
        hitsByMutantId.set(mutantId, existing + count)
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
