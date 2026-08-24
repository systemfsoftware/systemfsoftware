import type { CoverageData } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { TestResult } from '@systemfsoftware/stryker-js-plugin-api/test-runner'

/**
 * Pure reduction of per-test coverage into per-mutant coverage.
 * Uses plain records to stay within the benign-global allowlist (Object, Array).
 * No Map/Set — those are not on the decision's allowed globals.
 */
export function buildCoverageRecords(
  tests: readonly TestResult[],
  mutantCoverage: { perTest: Record<string, CoverageData>; static: CoverageData } | undefined,
): {
  testsByMutantId: Record<string, readonly string[]>
  hitsByMutantId: Record<string, number>
  testsById: Record<string, TestResult>
  staticCoverage: CoverageData | undefined
} {
  const testsById = tests.reduce<Record<string, TestResult>>((acc, t) => {
    acc[t.id] = t
    return acc
  }, {})

  if (mutantCoverage === undefined) {
    return { testsByMutantId: {}, hitsByMutantId: {}, testsById, staticCoverage: undefined }
  }

  const testsByMutantId: Record<string, string[]> = {}
  const hitsByMutantId: Record<string, number> = {}

  for (const testId of Object.keys(mutantCoverage.perTest)) {
    const cov = mutantCoverage.perTest[testId]
    if (!cov) {
      continue
    }
    const found = testsById[testId]
    if (!found) {
      continue
    }
    for (const mutantId of Object.keys(cov)) {
      const count = cov[mutantId]
      if (typeof count === 'number' && count > 0) {
        const arr = testsByMutantId[mutantId] ?? []
        arr.push(found.id)
        testsByMutantId[mutantId] = arr
      }
    }
  }

  const allCoverages: CoverageData[] = [
    mutantCoverage.static,
    ...Object.values(mutantCoverage.perTest).filter((c): c is CoverageData => c !== undefined),
  ]
  for (const cov of allCoverages) {
    if (!cov) {
      continue
    }
    for (const mutantId of Object.keys(cov)) {
      const count = cov[mutantId]
      if (typeof count === 'number') {
        hitsByMutantId[mutantId] = (hitsByMutantId[mutantId] ?? 0) + count
      }
    }
  }

  return { testsByMutantId, hitsByMutantId, testsById, staticCoverage: mutantCoverage.static }
}
