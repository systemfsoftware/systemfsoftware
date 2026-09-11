import type { CheckResult, CheckStatus, PassedCheckResult } from '@systemfsoftware/stryker-js/Checker'
import type {
  Location,
  MutantResult,
  MutantStatus,
  MutantTestCoverage,
  Position,
} from '@systemfsoftware/stryker-js/Mutant'
import type * as schema from '@systemfsoftware/stryker-js/Report'
import type { MutantRunResult } from '@systemfsoftware/stryker-js/TestRunner'
import * as Match from 'effect/Match'

interface MutantOutcome {
  readonly statusReason?: string | undefined
  readonly testsCompleted?: number | undefined
  readonly killedBy?: readonly string[] | undefined
}

export const toSchemaPosition = (pos: Position): schema.Position => ({
  column: pos.column + 1,
  line: pos.line + 1,
})

export const toSchemaLocation = (location: Location): schema.Location => ({
  start: toSchemaPosition(location.start),
  end: toSchemaPosition(location.end),
})

export const checkStatusToMutantStatus = (
  _status: Exclude<CheckStatus, 'passed'>,
): MutantStatus => 'CompileError'

const mutantResult = (
  mutant: MutantTestCoverage,
  status: MutantStatus,
  outcome: MutantOutcome = {},
): MutantResult => ({
  _tag: 'Mutant',
  id: mutant.id,
  fileName: mutant.fileName,
  mutatorName: mutant.mutatorName,
  replacement: mutant.replacement,
  location: toSchemaLocation(mutant.location),
  status,
  coveredBy: mutant.coveredBy,
  static: mutant.static,
  testsCompleted: mutant.testsCompleted,
  description: mutant.description,
  ...outcome,
})

export const mapCheckResult = (
  mutant: MutantTestCoverage,
  result: Exclude<CheckResult, PassedCheckResult>,
): MutantResult => mutantResult(mutant, checkStatusToMutantStatus(result.status), { statusReason: result.reason })

export const mapRunResult = (mutant: MutantTestCoverage, result: MutantRunResult): MutantResult =>
  Match.value(result).pipe(
    Match.discriminator('status')(
      'error',
      (errored) => mutantResult(mutant, 'RuntimeError', { statusReason: errored.errorMessage }),
    ),
    Match.discriminator('status')('killed', (killed) =>
      mutantResult(mutant, 'Killed', {
        testsCompleted: killed.nrOfTests,
        killedBy: [...killed.killedBy],
        statusReason: killed.failureMessage,
      })),
    Match.discriminator('status')('timeout', (timedOut) => {
      if (timedOut.reason === undefined) {
        return mutantResult(mutant, 'Timeout')
      }
      return mutantResult(mutant, 'Timeout', { statusReason: timedOut.reason })
    }),
    Match.discriminator('status')(
      'survived',
      (survived) => mutantResult(mutant, 'Survived', { testsCompleted: survived.nrOfTests }),
    ),
    Match.exhaustive,
  )
