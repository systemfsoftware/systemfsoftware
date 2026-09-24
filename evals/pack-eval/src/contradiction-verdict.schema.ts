import { Schema } from 'effect'
import { JudgePrompt } from './judge-prompt.schema.js'
import { AnswerCacheFailure } from './selection-trace.schema.js'

export const JudgeVerdict = Schema.Literals(['Pass', 'Fail'])
export type JudgeVerdict = typeof JudgeVerdict.Type

export class FewShotExample extends Schema.Class<FewShotExample>('FewShotExample')({
  taskText: Schema.NonEmptyString,
  ruleABody: Schema.NonEmptyString,
  ruleBBody: Schema.NonEmptyString,
  verdict: JudgeVerdict,
  critique: Schema.NonEmptyString,
}) {}

export class ContradictionJudgeRule extends Schema.Class<ContradictionJudgeRule>('ContradictionJudgeRule')({
  stem: Schema.NonEmptyString,
  title: Schema.NonEmptyString,
  body: Schema.NonEmptyString,
}) {}

export class ContradictionJudgeRequest extends Schema.Class<ContradictionJudgeRequest>(
  'ContradictionJudgeRequest',
)({
  packId: Schema.NonEmptyString,
  taskId: Schema.NonEmptyString,
  taskText: Schema.NonEmptyString,
  ruleA: ContradictionJudgeRule,
  ruleB: ContradictionJudgeRule,
  prompt: JudgePrompt,
  fewShot: Schema.Array(FewShotExample),
}) {}

export class JudgedPair extends Schema.Class<JudgedPair>('JudgedPair')({
  critique: Schema.NonEmptyString,
  verdict: JudgeVerdict,
  servedModel: Schema.String,
}) {}
export const JudgeReply = Schema.Struct({
  critique: Schema.NonEmptyString,
  verdict: JudgeVerdict,
})
export type JudgeReply = typeof JudgeReply.Type

export class JudgeFailure extends Schema.TaggedError<JudgeFailure>()('JudgeFailure', {
  role: Schema.String,
  model: Schema.String,
  message: Schema.String,
}) {}

export const JudgementError = Schema.Union([JudgeFailure, AnswerCacheFailure])
export type JudgementError = typeof JudgementError.Type

export const JudgePayload = Schema.Struct({
  critique: Schema.NonEmptyString,
  verdict: JudgeVerdict,
})
export type JudgePayload = typeof JudgePayload.Type
