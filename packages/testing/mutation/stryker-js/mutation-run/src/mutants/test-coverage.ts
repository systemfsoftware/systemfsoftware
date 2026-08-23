import { type CoverageData } from '@systemfsoftware/stryker-js-plugin-api/core'
import { type Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { commonTokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { type CompleteDryRunResult, type TestResult } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { notEmpty } from '@systemfsoftware/stryker-js-util'

import { injectionTokens } from '../plugins/index.js'

export class TestCoverage {
  readonly #testsByMutantId
  readonly #testsById
  readonly #staticCoverage
  readonly #hitsByMutantId

  constructor(
    testsByMutantId: Map<string, Set<TestResult>>,
    testsById: Map<string, TestResult>,
    staticCoverage: CoverageData | undefined,
    hitsByMutantId: Map<string, number>,
  ) {
    this.#testsByMutantId = testsByMutantId
    this.#testsById = testsById
    this.#staticCoverage = staticCoverage
    this.#hitsByMutantId = hitsByMutantId
  }

  public get testsByMutantId(): ReadonlyMap<string, Set<TestResult>> {
    return this.#testsByMutantId
  }
  public get testsById(): ReadonlyMap<string, TestResult> {
    return this.#testsById
  }
  public get hitsByMutantId(): ReadonlyMap<string, number> {
    return this.#hitsByMutantId
  }

  public get hasCoverage(): boolean {
    // Since static coverage should always be reported when coverage analysis succeeded (albeit an empty object),
    // we can use that to determine if there is any coverage at all
    return !!this.#staticCoverage
  }

  public hasStaticCoverage(mutantId: string): boolean {
    const coverage = this.#staticCoverage?.[mutantId]
    return coverage !== undefined && coverage > 0
  }

  public addTest(testResult: TestResult): void {
    this.#testsById.set(testResult.id, testResult)
  }

  public addCoverage(mutantId: string, testIds: string[]): void {
    const tests = this.#testsByMutantId.get(mutantId) ?? new Set()
    this.#testsByMutantId.set(mutantId, tests)
    testIds
      .map((testId) => this.#testsById.get(testId))
      .filter(notEmpty)
      .forEach((test) => tests.add(test))
  }

  public forMutant(mutantId: string): ReadonlySet<TestResult> | undefined {
    return this.#testsByMutantId.get(mutantId)
  }

  public static from = testCoverageFrom
}

function testCoverageFrom(
  { tests, mutantCoverage }: CompleteDryRunResult,
  logger: Logger,
): TestCoverage {
  const hitsByMutantId = new Map<string, number>()
  const testsByMutantId = new Map<string, Set<TestResult>>()
  const testsById = tests.reduce(
    (acc, test) => acc.set(test.id, test),
    new Map<string, TestResult>(),
  )
  if (mutantCoverage) {
    Object.entries(mutantCoverage.perTest).forEach(([testId, coverage]) => {
      const foundTest = testsById.get(testId)
      if (!foundTest) {
        logger.warn(
          `Found test with id "${testId}" in coverage data, but not in the test results of the dry run. Not taking coverage data for this test into account.`,
        )
        return
      }
      Object.entries(coverage).forEach(([mutantId, count]) => {
        if (count > 0) {
          let cov = testsByMutantId.get(mutantId)
          if (!cov) {
            cov = new Set()
            testsByMutantId.set(mutantId, cov)
          }
          cov.add(foundTest)
        }
      })
    })

    // We don't care about the exact tests in this case, just the total number of hits
    const coverageResultsPerMutant = [
      mutantCoverage.static,
      ...Object.values(mutantCoverage.perTest),
    ]
    coverageResultsPerMutant.forEach((coverageByMutantId) => {
      Object.entries(coverageByMutantId).forEach(([mutantId, count]) => {
        hitsByMutantId.set(
          mutantId,
          (hitsByMutantId.get(mutantId) ?? 0) + count,
        )
      })
    })
  }
  return new TestCoverage(
    testsByMutantId,
    testsById,
    mutantCoverage?.static,
    hitsByMutantId,
  )
}
testCoverageFrom.inject = [
  injectionTokens.dryRunResult,
  commonTokens.logger,
] as const
