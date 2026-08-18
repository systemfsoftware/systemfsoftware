import * as S from 'effect/Schema'

const PositionSchema = S.Struct({
  line: S.Finite,
  column: S.Finite,
})

const LocationSchema = S.Struct({
  start: PositionSchema,
  end: PositionSchema,
})

const OpenEndLocationSchema = S.Struct({
  start: PositionSchema,
  end: S.optionalKey(PositionSchema),
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

/** A report mutant: the full named surface of `MutantResult`. */
const MutantResultLikeSchema = S.Struct({
  id: S.String,
  mutatorName: S.String,
  replacement: S.String,
  location: LocationSchema,
  status: S.Literals(MUTANT_STATUSES),
  killedBy: S.optionalKey(S.mutable(S.Array(S.String))),
  coveredBy: S.optionalKey(S.mutable(S.Array(S.String))),
  static: S.optionalKey(S.Boolean),
  statusReason: S.optionalKey(S.String),
  testsCompleted: S.optionalKey(S.Finite),
  description: S.optionalKey(S.String),
  duration: S.optionalKey(S.Finite),
})

/** A report file entry. */
const FileResultLikeSchema = S.Struct({
  language: S.String,
  source: S.String,
  mutants: S.mutable(S.Array(MutantResultLikeSchema)),
})

/** A report test entry. */
const TestDefinitionLikeSchema = S.Struct({
  id: S.String,
  name: S.String,
  location: S.optionalKey(OpenEndLocationSchema),
})

/** A report test file. */
const TestFileLikeSchema = S.Struct({
  source: S.optionalKey(S.String),
  tests: S.mutable(S.Array(TestDefinitionLikeSchema)),
})

const ThresholdsLikeSchema = S.Struct({
  high: S.Finite,
  low: S.Finite,
})

/**
 * The prior-report document the incremental differ reuses. An open struct:
 * every key the reader does not reshape is preserved verbatim. The report is
 * data from disk, so it is decoded through this schema rather than trusted.
 * `schemaVersion` and `thresholds` are declared — not just passed through the
 * open rest — because the reshaped document is returned as a
 * `MutationTestResult`, whose type names them.
 */
export const IncrementalReportSchema = S.StructWithRest(
  S.Struct({
    schemaVersion: S.String,
    thresholds: ThresholdsLikeSchema,
    files: S.Record(S.String, FileResultLikeSchema),
    testFiles: S.optionalKey(S.Record(S.String, TestFileLikeSchema)),
  }),
  [S.Record(S.String, S.Unknown)],
)
