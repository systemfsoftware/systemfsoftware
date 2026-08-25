import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class MutationTestCommand extends S.TaggedClass<MutationTestCommand>()('MutationTestCommand', {}) {}

export class MutationTestDecision extends S.TaggedClass<MutationTestDecision>()('MutationTestDecision', {}) {}

export class MutationTestError extends S.TaggedError<MutationTestError>()('MutationTestError', {
  stage: S.Literal('mutationTest'),
  reason: S.String,
}) {}

export const mutationTestWorkflow = Workflow.make(
  MutationTestCommand,
  (_command: MutationTestCommand): Result.Result<MutationTestDecision, MutationTestError> =>
    Result.succeed(new MutationTestDecision({})),
)
