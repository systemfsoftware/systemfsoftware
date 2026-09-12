/**
 * The bridge from an ABI payload's `StandardSchemaV1` to an Effect codec the
 * host can compose with `S.Array`, `S.Record`, `S.optional` and `S.is`.
 *
 * The ABI publishes payloads as standard schemas so a plugin author installs
 * nothing but the ABI; the host composes them internally, where `effect` is
 * already present. Decoding runs the ABI schema's own `validate` and yields the
 * value it decoded, so a payload the ABI canonicalizes (the option codec fills
 * its defaults) reaches the host canonicalized, and the ABI stays the single
 * source of every payload shape — none is re-declared here. Encoding is
 * identity: a standard schema carries no encoder, and payloads cross as plain
 * data.
 */
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as S from 'effect/Schema'
import type * as SchemaAST from 'effect/SchemaAST'
import * as SchemaIssue from 'effect/SchemaIssue'

import { CheckerFailedSchema, CheckResultSchema } from '@systemfsoftware/stryker-js/Checker'
import { ExitClassSchema } from '@systemfsoftware/stryker-js/ExitClass'
import { LocationSchema, MutantSchema, MutantStatusSchema, PositionSchema } from '@systemfsoftware/stryker-js/Mutant'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Options'
import type {
  StandardSchemaV1,
  StandardSchemaV1Failure,
  StandardSchemaV1Issue,
  StandardSchemaV1PathSegment,
  StandardSchemaV1Result,
} from '@systemfsoftware/stryker-js/Plugin.schema'
import {
  FileResultSchema,
  MetricsResultSchema,
  MetricsSchema,
  MutantResultSchema,
  MutationTestResultSchema,
} from '@systemfsoftware/stryker-js/Report'
import {
  DryRunCompletedSchema,
  MutantTestedSchema,
  MutationTestingPlanReadySchema,
  MutationTestReportReadySchema,
  ReporterEventSchema,
  ReporterFailedSchema,
} from '@systemfsoftware/stryker-js/Reporter'
import {
  DryRunOptionsSchema,
  DryRunResultSchema,
  MutantCoverageSchema,
  MutantRunOptionsSchema,
  MutantRunResultSchema,
  TestResultSchema,
  TestRunnerCapabilitiesSchema,
  TestRunnerFailedSchema,
} from '@systemfsoftware/stryker-js/TestRunner'

const ASYNC_VERDICT = 'this payload schema validated asynchronously; the host bridge requires a synchronous verdict'

const SILENT_VERDICT = 'this payload schema refused the value without naming an issue'

type PayloadVerdict<A> = StandardSchemaV1Result<A> | Promise<StandardSchemaV1Result<A>>
type PathSegments = ReadonlyArray<PropertyKey | StandardSchemaV1PathSegment>

const isPendingVerdict = <A>(verdict: PayloadVerdict<A>): verdict is Promise<StandardSchemaV1Result<A>> =>
  verdict instanceof Promise

const isRefusedVerdict = <A>(verdict: StandardSchemaV1Result<A>): verdict is StandardSchemaV1Failure =>
  verdict.issues !== undefined

const isPathSegment = (segment: PropertyKey | StandardSchemaV1PathSegment): segment is StandardSchemaV1PathSegment =>
  typeof segment === 'object'

const isPresentPath = (path: PathSegments | undefined): path is PathSegments => path !== undefined

const isNonEmptyIssues = (
  issues: ReadonlyArray<SchemaIssue.Issue>,
): issues is readonly [SchemaIssue.Issue, ...Array<SchemaIssue.Issue>] => issues.length > 0

const pathKey = (segment: PropertyKey | StandardSchemaV1PathSegment): PropertyKey =>
  Match.value(segment).pipe(
    Match.when(isPathSegment, (wrapped) => wrapped.key),
    Match.orElse((key) => key),
  )

const segmentsOf = (issue: StandardSchemaV1Issue): ReadonlyArray<PropertyKey> =>
  Match.value(issue.path).pipe(
    Match.when(isPresentPath, (path) => path.map(pathKey)),
    Match.orElse((): ReadonlyArray<PropertyKey> => []),
  )

/**
 * One ABI issue as a pointer at the offending property, which is the shape the
 * host's `describeErrors` reads `at <path>` lines out of.
 */
const issueAt = (issue: StandardSchemaV1Issue, input: unknown): SchemaIssue.Issue =>
  new SchemaIssue.Pointer(
    segmentsOf(issue),
    new SchemaIssue.InvalidValue({ message: issue.message }, input),
  )

const issueOf = (
  issues: readonly StandardSchemaV1Issue[],
  input: unknown,
  self: SchemaAST.Declaration,
  options: SchemaAST.ParseOptions,
): SchemaIssue.Issue =>
  Match.value(issues.map((issue) => issueAt(issue, input))).pipe(
    Match.when(
      isNonEmptyIssues,
      (leaves) => new SchemaIssue.Composite(self, leaves, input, options),
    ),
    Match.orElse(() => new SchemaIssue.InvalidValue({ message: SILENT_VERDICT }, input)),
  )

/**
 * The codec the ABI published a payload as, recovered by the type id every
 * Effect schema carries.
 *
 * `S.toStandardSchemaV1` hands back the codec it was given with a `~standard`
 * façade attached — its declared result is `StandardSchemaV1<Encoded, Type> & S`
 * — and the ABI widens that to its own structural interface at the module
 * boundary. The host, which has `effect`, recognizes the codec underneath and
 * derives from it, so the arbitrary comes from the ABI's own shape and nothing
 * about the payload is restated here.
 */
const isEffectCodec = <A>(value: unknown): value is S.Codec<A> => S.isSchema(value)

const UNRECOVERABLE_CODEC =
  'this bridged ABI payload is not an Effect codec, so an arbitrary cannot be derived from the ABI shape'

/**
 * The ABI schema as an Effect codec: parse runs the ABI's own `validate` and
 * succeeds with the value it decoded, so the host receives exactly what the ABI
 * publishes — validation and canonicalization alike. Encoding stays identity.
 *
 * The arbitrary is the published codec's own: a schema whose leaves come through
 * this bridge derives property values of the same domain the payload accepts, and
 * one leaf answered here answers every schema that composes it.
 */
const payload = <A>(schema: StandardSchemaV1<unknown, A>): S.Codec<A> =>
  S.declareConstructor<A>()(
    [],
    () => (input, self, options) =>
      Match.value(schema['~standard'].validate(input)).pipe(
        Match.when(
          isPendingVerdict,
          () => Effect.fail(new SchemaIssue.InvalidValue({ message: ASYNC_VERDICT }, input)),
        ),
        Match.when(isRefusedVerdict, (refused) => Effect.fail(issueOf(refused.issues, input, self, options))),
        Match.orElse((decoded) => Effect.succeed(decoded.value)),
      ),
    {
      toArbitrary: () => (fc) =>
        Match.value(schema).pipe(
          Match.when(isEffectCodec<A>, (codec) => S.toArbitrary(codec)(fc)),
          Match.orElse(() => {
            throw new Error(UNRECOVERABLE_CODEC)
          }),
        ),
    },
  )

export const MutantPayload = payload(MutantSchema)
export const MutantStatusPayload = payload(MutantStatusSchema)
export const LocationPayload = payload(LocationSchema)
export const PositionPayload = payload(PositionSchema)

export const CheckResultPayload = payload(CheckResultSchema)
export const CheckerFailedPayload = payload(CheckerFailedSchema)

export const DryRunOptionsPayload = payload(DryRunOptionsSchema)
export const DryRunResultPayload = payload(DryRunResultSchema)
export const MutantRunOptionsPayload = payload(MutantRunOptionsSchema)
export const MutantRunResultPayload = payload(MutantRunResultSchema)
export const TestRunnerCapabilitiesPayload = payload(TestRunnerCapabilitiesSchema)
export const TestRunnerFailedPayload = payload(TestRunnerFailedSchema)
export const MutantCoveragePayload = payload(MutantCoverageSchema)
export const TestResultPayload = payload(TestResultSchema)

export const RepoFileResultPayload = payload(FileResultSchema)
export const RepoMetricsPayload = payload(MetricsSchema)
export const RepoMetricsResultPayload = payload(MetricsResultSchema)
export const RepoMutantResultPayload = payload(MutantResultSchema)
export const MutationTestResultPayload = payload(MutationTestResultSchema)

export const DryRunCompletedPayload = payload(DryRunCompletedSchema)
export const MutantTestedPayload = payload(MutantTestedSchema)
export const MutationTestingPlanReadyPayload = payload(MutationTestingPlanReadySchema)
export const MutationTestReportReadyPayload = payload(MutationTestReportReadySchema)
export const ReporterEventPayload = payload(ReporterEventSchema)
export const ReporterFailedPayload = payload(ReporterFailedSchema)

export const StrykerOptionsPayload = payload(StrykerOptionsSchema)
export const ExitClassPayload = payload(ExitClassSchema)
