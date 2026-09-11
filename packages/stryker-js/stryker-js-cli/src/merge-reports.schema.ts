import { LocationSchema, MutantStatusSchema } from '@systemfsoftware/stryker-js/Report'
import * as S from 'effect/Schema'

export class MergeReportsFailed extends S.TaggedError<MergeReportsFailed>()('MergeReportsFailed', {
  reason: S.String,
}) {}

export const PartMetaSchema = S.Struct({ package: S.String, outcome: S.String })

export const StreamMutantLineSchema = S.Struct({
  kind: S.Literal('mutant'),
  id: S.String,
  status: MutantStatusSchema,
  file: S.String,
  location: LocationSchema,
  mutator: S.String,
  replacement: S.NullOr(S.String),
})
