import * as S from 'effect/Schema'

export class MutantPlacementFailed extends S.TaggedError<MutantPlacementFailed>()('MutantPlacementFailed', {
  fileName: S.String,
  placerName: S.String,
  mutantIds: S.Array(S.String),
  cause: S.Unknown,
}) {
  readonly exitClass = 'MutantPlacementFailed' as const
}

export class TransformFailed extends S.TaggedError<TransformFailed>()('TransformFailed', {
  fileName: S.String,
  cause: S.Unknown,
}) {
  readonly exitClass = 'TransformFailed' as const
}
