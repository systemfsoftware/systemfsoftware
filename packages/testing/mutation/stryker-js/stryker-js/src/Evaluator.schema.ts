import * as S from 'effect/Schema'

export class EvaluatorFailed extends S.TaggedError<EvaluatorFailed>()('EvaluatorFailed', {
  cause: S.Unknown,
}) {}
