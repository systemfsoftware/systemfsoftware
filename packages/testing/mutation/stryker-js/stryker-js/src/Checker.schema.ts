import * as S from 'effect/Schema'

export const CheckStatus = S.Literals(['passed', 'compileError'])
export type CheckStatus = typeof CheckStatus.Type

export class CheckerFailed extends S.TaggedError<CheckerFailed>()('CheckerFailed', {
  cause: S.String,
  checkerName: S.String,
  mutantIds: S.Array(S.String),
}) {}
