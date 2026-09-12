import * as S from 'effect/Schema'

import { LocationPayload, MutantStatusPayload, PositionPayload } from './abi-payload.schema.js'

const OpenEndLocationSchema = S.Struct({
  start: PositionPayload,
  end: S.optional(PositionPayload),
})

const MutantResultLikeSchema = S.Struct({
  id: S.String,
  mutatorName: S.String,
  replacement: S.String,
  location: LocationPayload,
  status: MutantStatusPayload,
  killedBy: S.optional(S.Array(S.String)),
  coveredBy: S.optional(S.Array(S.String)),
  static: S.optional(S.Boolean),
  statusReason: S.optional(S.String),
  testsCompleted: S.optional(S.Finite),
  description: S.optional(S.String),
  duration: S.optional(S.Finite),
})

const FileResultLikeSchema = S.Struct({
  language: S.String,
  source: S.String,
  mutants: S.Array(MutantResultLikeSchema),
})

const TestDefinitionLikeSchema = S.Struct({
  id: S.String,
  name: S.String,
  location: S.optional(OpenEndLocationSchema),
})

const TestFileLikeSchema = S.Struct({
  source: S.optional(S.String),
  tests: S.Array(TestDefinitionLikeSchema),
})

const ThresholdsLikeSchema = S.Struct({
  high: S.Finite,
  low: S.Finite,
})
export const IncrementalReportSchema = S.StructWithRest(
  S.Struct({
    schemaVersion: S.String,
    thresholds: ThresholdsLikeSchema,
    files: S.Record(S.String, FileResultLikeSchema),
    testFiles: S.optional(S.Record(S.String, TestFileLikeSchema)),
  }),
  [S.Record(S.String, S.Unknown)],
)

export class IncrementalReportError extends S.TaggedError<IncrementalReportError>()('IncrementalReportError', {
  message: S.String,
}) {}
