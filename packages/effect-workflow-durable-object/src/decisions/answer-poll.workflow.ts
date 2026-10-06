import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { EncodedExit, ExecutionState } from './journal.schema.js'

const AnswerPollTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-workflow-durable-object/AnswerPoll')

/** No result yet: the execution does not exist, or its current replay has not reached one. */
export class NoResult extends Schema.TaggedClass<NoResult>()('NoResult', {}) {
  readonly [AnswerPollTypeId] = AnswerPollTypeId
}

/** The execution's last replay suspended and waits for a wake. */
export class SuspendedResult extends Schema.TaggedClass<SuspendedResult>()('SuspendedResult', {}) {
  readonly [AnswerPollTypeId] = AnswerPollTypeId
}

/** The execution finished with this exit. */
export class CompleteResult extends Schema.TaggedClass<CompleteResult>()('CompleteResult', {
  exit: EncodedExit,
}) {
  readonly [AnswerPollTypeId] = AnswerPollTypeId
}

export const PollAnswer = Schema.Union([NoResult, SuspendedResult, CompleteResult])
export type PollAnswer = typeof PollAnswer.Type

export class AnswerPoll extends Schema.TaggedClass<AnswerPoll>()('AnswerPoll', {
  execution: ExecutionState,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const answerOf = (command: AnswerPoll): PollAnswer =>
  Match.value(command.execution).pipe(
    Match.tag('Absent', 'Running', () => new NoResult({})),
    Match.tag('Suspended', () => new SuspendedResult({})),
    Match.tag('Complete', (complete) => new CompleteResult({ exit: complete.exit })),
    Match.exhaustive,
  )

export const answerPoll = Workflow.make({
  command: AnswerPoll,
  decision: PollAnswer,
  error: Schema.Never,
  decide: (command): Result.Result<PollAnswer, never> => Result.succeed(answerOf(command)),
})
