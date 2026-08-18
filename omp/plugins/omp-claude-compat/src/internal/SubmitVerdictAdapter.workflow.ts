import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import type { HookDecision } from '../HookDispatcher.schema.js'
import { HookVerdictError, InterpretHookCommand, interpretHookResult } from '../HookVerdict.workflow.js'

/**
 * The submit decision's failure: the workflow's verdict error plus the raw's code and
 * stdout, as a schema-derived tagged struct — the error channel of a branded decide run
 * must carry a tag, and the struct derives one instead of declaring a `_tag` by hand.
 */
const SubmitHookVerdictError = S.TaggedStruct('SubmitHookVerdictError', {
  error: HookVerdictError,
  code: S.Finite,
  stdout: S.String,
})
export type SubmitHookVerdictError = S.Schema.Type<typeof SubmitHookVerdictError>

export interface SubmitVerdictDecoded {
  readonly cmd: InterpretHookCommand
  readonly code: number
  readonly stdout: string
}

export interface SubmitVerdictDecision {
  readonly verdict: HookDecision
  readonly code: number
  readonly stdout: string
}

/**
 * Maps the hook-verdict workflow's outcome into the submit outcome, carrying the
 * raw's code and stdout forward for the write phase.
 */
export const submitVerdictAdapter = Workflow.make(
  ({ cmd, code, stdout }: SubmitVerdictDecoded): Result.Result<SubmitVerdictDecision, SubmitHookVerdictError> =>
    Result.mapBoth(interpretHookResult(cmd), {
      onFailure: (error) => SubmitHookVerdictError.make({ error, code, stdout }),
      onSuccess: (verdict) => ({ verdict, code, stdout }),
    }),
)
