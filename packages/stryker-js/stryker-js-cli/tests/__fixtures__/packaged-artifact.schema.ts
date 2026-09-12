import * as S from 'effect/Schema'

export const ReportsSchema = S.fromJsonString(
  S.Struct({
    htmlBytes: S.Number,
    viewerBundle: S.Boolean,
    jsonBytes: S.Number,
  }),
)

export const ManifestViewSchema = S.fromJsonString(
  S.Struct({
    dependencies: S.Array(S.String),
    exports: S.Array(S.String),
  }),
)
