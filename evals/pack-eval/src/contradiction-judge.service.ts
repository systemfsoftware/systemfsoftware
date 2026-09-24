import { Context, type Effect } from 'effect'
import type { ContradictionJudgeRequest, JudgedPair, JudgeFailure } from './contradiction-verdict.schema.js'
import type { AnswerCacheFailure } from './selection-trace.schema.js'

export interface ContradictionJudgeShape {
  readonly judge: (
    request: ContradictionJudgeRequest,
  ) => Effect.Effect<JudgedPair, JudgeFailure | AnswerCacheFailure>
}

export class ContradictionJudge extends Context.Service<ContradictionJudge, ContradictionJudgeShape>()(
  '@systemfsoftware/pack-eval/ContradictionJudge',
) {}
