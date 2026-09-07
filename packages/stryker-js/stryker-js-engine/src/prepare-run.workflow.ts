import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class PrepareWorkflowError extends S.TaggedError<PrepareWorkflowError>()('PrepareWorkflowError', {
  stage: S.Literal('prepare'),
  reason: S.String,
}) {}

export class PrepareCommand extends S.TaggedClass<PrepareCommand>()('PrepareCommand', {
  fileCount: S.Finite,
  mutateCount: S.Finite,
}) {}

const PrepareDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-engine/PrepareDecision')
type PrepareDecisionTypeId = typeof PrepareDecisionTypeId

export class PreparePlanned extends S.TaggedClass<PreparePlanned>()('PreparePlanned', {
  fileCount: S.Finite,
  mutateCount: S.Finite,
}) {
  readonly [PrepareDecisionTypeId] = PrepareDecisionTypeId
}

export class PrepareRefused extends S.TaggedClass<PrepareRefused>()('PrepareRefused', {
  reason: S.String,
}) {
  readonly [PrepareDecisionTypeId] = PrepareDecisionTypeId
}

export type PrepareDecision = PreparePlanned | PrepareRefused

const toPrepareKind = (command: PrepareCommand): 'Invalid' | 'Empty' | 'Ready' => {
  if (command.fileCount < 0) {
    return 'Invalid'
  }
  if (command.fileCount === 0) {
    return 'Empty'
  }
  return 'Ready'
}

export const prepareRun = Workflow.make(
  PrepareCommand,
  (command: PrepareCommand): Result.Result<PrepareDecision, PrepareWorkflowError> =>
    Match.value(toPrepareKind(command)).pipe(
      Match.when(
        'Invalid',
        () => Result.fail(new PrepareWorkflowError({ stage: 'prepare', reason: 'Invalid file count' })),
      ),
      Match.when('Empty', () => Result.succeed(new PrepareRefused({ reason: 'No input files found.' }))),
      Match.when(
        'Ready',
        () => Result.succeed(new PreparePlanned({ fileCount: command.fileCount, mutateCount: command.mutateCount })),
      ),
      Match.exhaustive,
    ),
)
