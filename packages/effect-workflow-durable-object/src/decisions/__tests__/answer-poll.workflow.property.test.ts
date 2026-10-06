import { it } from '@systemfsoftware/vitest'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { AnswerPoll, answerPoll, NoResult, type PollAnswer, SuspendedResult } from '../answer-poll.workflow.js'
import { EncodedExit, ExecutionState } from '../journal.schema.js'

type Subject = typeof answerPoll

const answerOf = (subject: Subject, execution: ExecutionState): PollAnswer =>
  Result.match(subject(new AnswerPoll({ execution })), {
    onFailure: (missing: never) => missing,
    onSuccess: (answer) => answer,
  })

const answersExit = (answer: PollAnswer, exit: EncodedExit): boolean =>
  Match.value(answer).pipe(
    Match.tag('CompleteResult', (complete) => Schema.toEquivalence(EncodedExit)(complete.exit, exit)),
    Match.tag('NoResult', 'SuspendedResult', () => false),
    Match.exhaustive,
  )

// Kills a poll that reports a result before any replay reached one.
it.prop(
  '∀s_NotYetReplayed_=NoResult',
  { of: [Schema.Union([ExecutionState.cases.Absent, ExecutionState.cases.Running])], subject: answerPoll },
  (subject, [execution]) => Schema.is(NoResult)(answerOf(subject, execution)),
)

// Kills a poll that hides a suspended execution behind "no result".
it.prop(
  '∀s_Suspended_=SuspendedResult',
  { of: [ExecutionState.cases.Suspended], subject: answerPoll },
  (subject, [execution]) => Schema.is(SuspendedResult)(answerOf(subject, execution)),
)

// Kills a poll that loses or rewrites the final exit.
it.prop(
  '∀x_Complete_=CompleteResult',
  { of: [EncodedExit], subject: answerPoll },
  (subject, [exit]) => answersExit(answerOf(subject, { _tag: 'Complete', exit }), exit),
)
