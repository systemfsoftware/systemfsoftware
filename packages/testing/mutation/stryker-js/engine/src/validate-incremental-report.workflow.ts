/**
 * Incremental report — decoding and reshaping the prior report read from disk.
 *
 * The document is data from a previous run, so it is decoded here rather than
 * trusted: the reader hands over the parsed JSON and this decides whether it is
 * a report at all. Every location is then rebuilt from its two axes, so what the
 * engine compares against holds only the coordinates the schema declares and
 * nothing a foreign writer happened to attach alongside them.
 *
 * The schema is declared here rather than in a sibling `*.schema.ts` because the
 * decision reads it: a decision body may only reach parameters, locals and
 * declarations in its own file, so the schema it decodes through has to be one.
 */
import { Wire, Workflow } from '@systemfsoftware/effect-cell-types'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
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

/** Every key the reader does not reshape is preserved verbatim via the open rest. */
export const IncrementalReportSchema = S.StructWithRest(
  S.Struct({
    schemaVersion: S.String,
    thresholds: ThresholdsLikeSchema,
    files: S.Record(S.String, FileResultLikeSchema),
    testFiles: S.optional(S.Record(S.String, TestFileLikeSchema)),
  }),
  [S.Record(S.String, S.Unknown)],
)

type DecodedReport = typeof IncrementalReportSchema.Type

interface Position {
  readonly line: number
  readonly column: number
}

/** Rebuilds the position from its two axes, dropping whatever else the report carried. */
const toPosition = (position: Position): Position => ({
  line: position.line,
  column: position.column,
})

const toLocation = (
  location: { readonly start: Position; readonly end: Position },
): { readonly start: Position; readonly end: Position } => ({
  start: toPosition(location.start),
  end: toPosition(location.end),
})

const toOpenEndLocation = (
  location: { readonly start: Position; readonly end?: Position | undefined },
): { readonly start: Position; readonly end?: Position } =>
  Option.match(Option.fromUndefinedOr(location.end), {
    onNone: () => ({ start: toPosition(location.start) }),
    onSome: (end) => ({ start: toPosition(location.start), end: toPosition(end) }),
  })

const withMappedMutantLocations = (report: DecodedReport): DecodedReport['files'] =>
  Object.fromEntries(
    Object.entries(report.files).map(([fileName, file]) => [
      fileName,
      {
        ...file,
        mutants: file.mutants.map((mutant) => ({ ...mutant, location: toLocation(mutant.location) })),
      },
    ]),
  )

const withMappedTestLocations = (testFiles: NonNullable<DecodedReport['testFiles']>): DecodedReport['testFiles'] =>
  Object.fromEntries(
    Object.entries(testFiles).map(([fileName, file]) => [
      fileName,
      {
        ...file,
        tests: file.tests.map((test) =>
          Option.match(Option.fromUndefinedOr(test.location), {
            onNone: () => ({ ...test }),
            onSome: (location) => ({ ...test, location: toOpenEndLocation(location) }),
          })
        ),
      },
    ]),
  )

const reshape = (decoded: DecodedReport): DecodedReport =>
  Option.match(Option.fromUndefinedOr(decoded.testFiles), {
    onNone: (): DecodedReport => ({ ...decoded, files: withMappedMutantLocations(decoded) }),
    onSome: (testFiles): DecodedReport => ({
      ...decoded,
      files: withMappedMutantLocations(decoded),
      testFiles: withMappedTestLocations(testFiles),
    }),
  })

const decodeReport = (raw: unknown): Result.Result<IncrementalReportDecision, IncrementalReportError> =>
  Result.match(S.decodeUnknownResult(IncrementalReportSchema)(raw), {
    onFailure: () =>
      Result.fail(
        new IncrementalReportError({
          message:
            'The incremental report is not a mutation testing report; delete it or re-run without --incremental.',
        }),
      ),
    onSuccess: (decoded) => Result.succeed(new IncrementalReportDecision({ report: reshape(decoded) })),
  })

export class IncrementalReportCommand extends S.TaggedClass<IncrementalReportCommand>()('IncrementalReportCommand', {
  /** The parsed JSON of the prior report, or absent when there is no prior run. */
  raw: S.optional(S.Unknown),
}) {}

export class IncrementalReportDecision extends S.TaggedClass<IncrementalReportDecision>()('IncrementalReportDecision', {
  report: S.optional(S.Unknown),
}) {}

export class IncrementalReportError extends S.TaggedError<IncrementalReportError>()('IncrementalReportError', {
  message: S.String,
}) {}

export const validateIncrementalReport = Workflow.make(
  IncrementalReportCommand,
  (command: IncrementalReportCommand): Result.Result<IncrementalReportDecision, IncrementalReportError> =>
    Option.match(Option.fromUndefinedOr(command.raw), {
      onNone: () => Result.succeed(new IncrementalReportDecision({})),
      onSome: decodeReport,
    }),
)
