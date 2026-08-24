import type { CoverageData } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { CompleteDryRunResult, TestResult } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { buildCoverageRecords } from './coverage-join.kernel.js'
import { CoverageJoinError } from './coverage-join.schema.js'

export class CoverageJoinCommand extends S.TaggedClass<CoverageJoinCommand>()('CoverageJoinCommand', {
  dryRunResult: S.Unknown,
}) {}

export type CoverageDecision = {
  readonly testsByMutantId: Readonly<Record<string, readonly string[]>>
  readonly testsById: Readonly<Record<string, TestResult>>
  readonly hitsByMutantId: Readonly<Record<string, number>>
  readonly staticCoverage: CoverageData | undefined
}

export function coverageJoin(dryRunResult: CompleteDryRunResult): Result.Result<CoverageDecision, CoverageJoinError> {
  const built = buildCoverageRecords(dryRunResult.tests, dryRunResult.mutantCoverage)
  return Result.succeed({
    testsByMutantId: built.testsByMutantId,
    testsById: built.testsById,
    hitsByMutantId: built.hitsByMutantId,
    staticCoverage: built.staticCoverage,
  })
}
