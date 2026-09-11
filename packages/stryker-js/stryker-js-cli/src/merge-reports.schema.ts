import * as S from 'effect/Schema'
import { LocationPayload, MutantStatusPayload } from './run/abi-payload.schema.js'

export class MergeReportsFailed extends S.TaggedError<MergeReportsFailed>()('MergeReportsFailed', {
  reason: S.String,
}) {}

export const PartMetaSchema = S.Struct({ package: S.String, outcome: S.String })

export const StreamMutantLineSchema = S.Struct({
  kind: S.Literal('mutant'),
  id: S.String,
  status: MutantStatusPayload,
  file: S.String,
  location: LocationPayload,
  mutator: S.String,
  replacement: S.NullOr(S.String),
})
