import * as Match from 'effect/Match'

import type { RunVerdictDecision } from './fold-run-verdict.workflow.js'
import type { RunVerdict } from './run-verdict.schema.js'

export const runVerdictOf = (decision: RunVerdictDecision): RunVerdict =>
  Match.value(decision).pipe(
    Match.tag('VerdictPassed', (): RunVerdict => ({ status: 'passed', exitCode: 0, failures: [] })),
    Match.tag('VerdictFailed', ({ failures }): RunVerdict => ({ status: 'failed', exitCode: 1, failures })),
    Match.tag('VerdictBlocked', ({ failures }): RunVerdict => ({ status: 'blocked', exitCode: 3, failures })),
    Match.tag('VerdictErrored', ({ failures }): RunVerdict => ({ status: 'error', exitCode: 4, failures })),
    Match.tag('VerdictInterrupted', ({ failures }): RunVerdict => ({ status: 'interrupted', exitCode: 130, failures })),
    Match.exhaustive,
  )
