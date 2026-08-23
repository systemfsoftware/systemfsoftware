import * as S from 'effect/Schema'

export const HitCountMetaSchema = S.Struct({ hitCount: S.optional(S.Finite) })
export const MutantCoverageMetaSchema = S.Struct({
  mutantCoverage: S.optional(
    S.Struct({
      static: S.Record(S.String, S.Finite),
      perTest: S.Record(S.String, S.Record(S.String, S.Finite)),
    }),
  ),
})
export const MutantCoverageShapeSchema = S.Struct({
  static: S.Record(S.String, S.Finite),
  perTest: S.Record(S.String, S.Record(S.String, S.Finite)),
})

export class CoverageDecodeFailed extends S.TaggedError<CoverageDecodeFailed>()('CoverageDecodeFailed', {
  cause: S.Unknown,
}) {}
