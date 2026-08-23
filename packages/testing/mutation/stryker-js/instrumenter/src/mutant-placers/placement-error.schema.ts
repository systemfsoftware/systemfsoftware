import * as S from 'effect/Schema'

export class PlacementFailed extends S.TaggedError<PlacementFailed>()('PlacementFailed', {
  fileName: S.String,
  placerName: S.String,
  mutantIds: S.Array(S.String),
  cause: S.Unknown,
}) {
  readonly exitClass = 'PlacementFailed' as const
}
