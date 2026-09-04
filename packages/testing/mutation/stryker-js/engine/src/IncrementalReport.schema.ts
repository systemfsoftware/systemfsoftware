import { Wire } from '@systemfsoftware/effect-cell-types'
import * as S from 'effect/Schema'

const PositionSchema = Wire.wire({
  line: Wire.mint(S.Finite),
  column: Wire.mint(S.Finite),
})

const LocationSchema = Wire.wire({
  start: PositionSchema,
  end: PositionSchema,
})

const OpenEndLocationSchema = Wire.wire({
  start: PositionSchema,
  end: Wire.mint(S.optional(PositionSchema)),
})

const MUTANT_STATUSES = [
  'Killed',
  'Survived',
  'NoCoverage',
  'Timeout',
  'CompileError',
  'RuntimeError',
  'Ignored',
  'Pending',
] as const

const MutantResultLikeSchema = Wire.wire({
  id: Wire.mint(S.String),
  mutatorName: Wire.mint(S.String),
  replacement: Wire.mint(S.String),
  location: LocationSchema,
  status: Wire.mint(S.Literals(MUTANT_STATUSES)),
  killedBy: Wire.mint(S.optional(Wire.mint(S.Array(Wire.mint(S.String))))),
  coveredBy: Wire.mint(S.optional(Wire.mint(S.Array(Wire.mint(S.String))))),
  static: Wire.mint(S.optional(Wire.mint(S.Boolean))),
  statusReason: Wire.mint(S.optional(Wire.mint(S.String))),
  testsCompleted: Wire.mint(S.optional(Wire.mint(S.Finite))),
  description: Wire.mint(S.optional(Wire.mint(S.String))),
  duration: Wire.mint(S.optional(Wire.mint(S.Finite))),
})

const FileResultLikeSchema = Wire.wire({
  language: Wire.mint(S.String),
  source: Wire.mint(S.String),
  mutants: Wire.mint(S.Array(MutantResultLikeSchema)),
})

const TestDefinitionLikeSchema = Wire.wire({
  id: Wire.mint(S.String),
  name: Wire.mint(S.String),
  location: Wire.mint(S.optional(OpenEndLocationSchema)),
})

const TestFileLikeSchema = Wire.wire({
  source: Wire.mint(S.optional(Wire.mint(S.String))),
  tests: Wire.mint(S.Array(TestDefinitionLikeSchema)),
})

const ThresholdsLikeSchema = Wire.wire({
  high: Wire.mint(S.Finite),
  low: Wire.mint(S.Finite),
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
