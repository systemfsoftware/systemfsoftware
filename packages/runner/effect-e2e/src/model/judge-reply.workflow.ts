import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import type { Evidence } from '../verdict/failure.schema.js'
import { ContextOverflow, ModelOutputInvalid, ModelProviderFailed, ModelRefused } from '../verdict/failure.schema.js'
import { TokenUsage } from '../verdict/step-record.schema.js'
import {
  type Answered,
  FinishReason,
  ModelAnswer,
  ModelFailure,
  ProviderReply,
  type Rejected,
  type ReplyFinish,
} from './model.schema.js'

const JudgedReplyTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/JudgedReply')
type JudgedReplyTypeId = typeof JudgedReplyTypeId

export class Accepted extends Schema.TaggedClass<Accepted>()('Accepted', {
  answer: ModelAnswer,
  finishReason: FinishReason,
  usage: TokenUsage,
  model: Schema.String,
}) {
  readonly [JudgedReplyTypeId] = JudgedReplyTypeId
}

export class JudgeReply extends Schema.TaggedClass<JudgeReply>()('JudgeReply', { reply: ProviderReply }) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const CONTEXT_LENGTH_EXCEEDED = 'context_length_exceeded'

const PAYLOAD_TOO_LARGE = 413

const evidenceOf = (text: string): Evidence => [{ _tag: 'LogEvidence', text }]

const codeSuffixOf = (code: string | null): string =>
  Option.match(Option.fromNullishOr(code), { onNone: () => '', onSome: (present) => ` (${present})` })

const rejectionTextOf = (rejected: Rejected): string =>
  `the provider answered ${rejected.status}${codeSuffixOf(rejected.code)}: ${rejected.message}`

const isContextSignal = (rejected: Rejected): boolean =>
  [rejected.status === PAYLOAD_TOO_LARGE, rejected.code === CONTEXT_LENGTH_EXCEEDED].includes(true)

const failureOfRejected = (rejected: Rejected): ModelFailure =>
  Match.value(isContextSignal(rejected)).pipe(
    Match.when(true, (): ModelFailure =>
      ContextOverflow.make({ message: rejectionTextOf(rejected), evidence: evidenceOf(rejectionTextOf(rejected)) })),
    Match.when(false, (): ModelFailure =>
      ModelProviderFailed.make({
        message: rejectionTextOf(rejected),
        evidence: evidenceOf(rejectionTextOf(rejected)),
      })),
    Match.exhaustive,
  )

const refusalTextOf = (answered: Answered): string => Option.getOrElse(Option.fromNullishOr(answered.refusal), () => '')

const isRefused = (answered: Answered): boolean =>
  [answered.finish === 'content_filter', refusalTextOf(answered).length > 0].includes(true)

const refusedOf = (answered: Answered): ModelFailure =>
  ModelRefused.make({
    message: `the model refused: ${refusalTextOf(answered)}`,
    evidence: evidenceOf(`finish ${answered.finish}, refusal: ${refusalTextOf(answered)}`),
  })

const erroredOf = (answered: Answered): ModelFailure =>
  ModelProviderFailed.make({
    message: `the provider ended the answer from ${answered.model} with an error`,
    evidence: evidenceOf(`finish ${answered.finish}`),
  })

const emptyOf = (answered: Answered): ModelFailure =>
  ModelOutputInvalid.make({
    message: 'the model answered with neither text nor a tool call',
    evidence: evidenceOf(`finish ${answered.finish} from ${answered.model}, no text and no tool call`),
  })

const textAnswerOf = (text: string | null): Option.Option<ModelAnswer> =>
  Option.fromNullishOr(text).pipe(
    Option.filter((present) => present.length > 0),
    Option.map((present): ModelAnswer => ({ _tag: 'Text', text: present })),
  )

const answerOf = (answered: Answered): Option.Option<ModelAnswer> =>
  Arr.match(answered.toolCalls, {
    onEmpty: () => textAnswerOf(answered.text),
    onNonEmpty: (calls) => Option.some<ModelAnswer>({ _tag: 'ToolCalls', calls }),
  })

const finishReasonOf = (finish: ReplyFinish): FinishReason =>
  Option.getOrElse(Schema.decodeUnknownOption(FinishReason)(finish), (): FinishReason => 'other')

const acceptedOf = (answered: Answered) => (answer: ModelAnswer): Accepted =>
  Accepted.make({ answer, finishReason: finishReasonOf(answered.finish), usage: answered.usage, model: answered.model })

type AnsweredVerdict = 'refused' | 'errored' | 'answered'

const finishVerdictOf = (finish: ReplyFinish): AnsweredVerdict =>
  Match.value(finish).pipe(
    Match.when('error', (): AnsweredVerdict => 'errored'),
    Match.orElse((): AnsweredVerdict => 'answered'),
  )

const verdictOf = (answered: Answered): AnsweredVerdict =>
  Match.value(isRefused(answered)).pipe(
    Match.when(true, (): AnsweredVerdict => 'refused'),
    Match.when(false, () => finishVerdictOf(answered.finish)),
    Match.exhaustive,
  )

const decideAnswered = (answered: Answered): Result.Result<Accepted, ModelFailure> =>
  Match.value(verdictOf(answered)).pipe(
    Match.when('refused', () => Result.fail(refusedOf(answered))),
    Match.when('errored', () => Result.fail(erroredOf(answered))),
    Match.when('answered', () =>
      Option.match(answerOf(answered), {
        onNone: () => Result.fail(emptyOf(answered)),
        onSome: (answer) => Result.succeed(acceptedOf(answered)(answer)),
      })),
    Match.exhaustive,
  )

export const judgeReply = Workflow.make({
  command: JudgeReply,
  decision: Accepted,
  error: ModelFailure,
  decide: (command): Result.Result<Accepted, ModelFailure> =>
    Match.valueTags(command.reply, {
      Rejected: (rejected) => Result.fail(failureOfRejected(rejected)),
      Answered: decideAnswered,
    }),
})
