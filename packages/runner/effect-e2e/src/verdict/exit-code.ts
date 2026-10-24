import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

import type { Attempt, RanAttempt } from '../report/report.schema.js'
import type { FailureRecord } from './failure.schema.js'
import { FoldRunVerdict, foldRunVerdict, type RunVerdictDecision } from './fold-run-verdict.workflow.js'
import type { ExitCode, RunEnding, RunVerdict } from './run-verdict.schema.js'

export const runVerdictOf = (decision: RunVerdictDecision): RunVerdict =>
  Match.value(decision).pipe(
    Match.tag('VerdictPassed', (): RunVerdict => ({ status: 'passed', exitCode: 0, failures: [] })),
    Match.tag('VerdictFailed', ({ failures }): RunVerdict => ({ status: 'failed', exitCode: 1, failures })),
    Match.tag('VerdictBlocked', ({ failures }): RunVerdict => ({ status: 'blocked', exitCode: 3, failures })),
    Match.tag('VerdictErrored', ({ failures }): RunVerdict => ({ status: 'error', exitCode: 4, failures })),
    Match.tag('VerdictInterrupted', ({ failures }): RunVerdict => ({ status: 'interrupted', exitCode: 130, failures })),
    Match.exhaustive,
  )

export const exitCodeOf = (ending: RunEnding): ExitCode =>
  Match.valueTags(ending, {
    Judged: ({ verdict }) => verdict.exitCode,
    ConfigRefused: (): ExitCode => 2,
  })

const ranOf = (attempt: Attempt): ReadonlyArray<RanAttempt> =>
  Match.valueTags(attempt, { Ran: (ran): ReadonlyArray<RanAttempt> => [ran], Skipped: () => [] })

export interface FinalVerdictRequest {
  readonly finals: ReadonlyArray<Attempt>
  readonly runErrors: ReadonlyArray<FailureRecord>
}

/**
 * The run verdict over each result's final attempt plus the run-level errors, so a test that passes on retry
 * does not fail the run and a skipped test weighs nothing (requirements FR-5).
 */
export const finalVerdictOf = (request: FinalVerdictRequest): RunVerdict => {
  const ran = Arr.flatMap(request.finals, ranOf)
  return Result.match(
    foldRunVerdict(
      new FoldRunVerdict({
        steps: Arr.flatMap(ran, (run) => run.steps),
        runErrors: [...Arr.flatMap(ran, (run) => run.errors), ...request.runErrors],
      }),
    ),
    { onFailure: (missing: never) => missing, onSuccess: runVerdictOf },
  )
}
