import * as S from 'effect/Schema'

export const CheckStatus = S.Literals(['passed', 'compileError'])
export type CheckStatus = typeof CheckStatus.Type
const CheckFailureReasonSchema = S.String.pipe(S.brand('CheckFailureReason'))

export const CheckResultSchema = S.Union([
  S.Struct({ status: S.Literal('passed') }),
  S.Struct({ status: S.Literal('compileError'), reason: CheckFailureReasonSchema }),
])

export class CheckerFailed extends S.TaggedError<CheckerFailed>()('CheckerFailed', {
  cause: S.String,
  checkerName: S.String,
  mutantIds: S.Array(S.String),
}) {}
