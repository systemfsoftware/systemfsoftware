/**
 * Generation schemas for the admit-survivors-run property suite. Extracted
 * from the property test so module-scope schema declarations live in a
 * `*.schema.ts` file; the test imports its `it.prop` inputs from here.
 *
 * Every bound mirrors the hand-built FastCheck options these schemas
 * replace — short keys, capped collections, bounded positions — so the
 * generated reports keep the shape the admission comparison was pinned
 * against.
 */
import * as S from 'effect/Schema'

const shortToken = S.String.check(S.isMinLength(1), S.isMaxLength(8))
const shortReplacement = S.String.check(S.isMaxLength(8))
const shortKey = S.String.check(S.isMaxLength(6))
const fileKey = S.String.check(S.isMinLength(1), S.isMaxLength(6))
const shortConfigText = S.String.check(S.isMaxLength(6))
const frameworkVersionText = S.String.check(S.isMinLength(1), S.isMaxLength(6))

export const ContentText = S.String.check(S.isMaxLength(16))

const ReportPosition = S.Struct({
  line: S.Int.check(S.isBetween({ minimum: 1, maximum: 200 })),
  column: S.Int.check(S.isBetween({ minimum: 1, maximum: 200 })),
})

const ReportLocation = S.Struct({ start: ReportPosition, end: ReportPosition })

const NonSurvivedStatus = S.Literals([
  'Killed',
  'NoCoverage',
  'Timeout',
  'RuntimeError',
  'CompileError',
  'Ignored',
  'Pending',
])

const NonSurvivedMutant = S.Struct({
  id: shortToken,
  mutatorName: shortToken,
  location: ReportLocation,
  status: NonSurvivedStatus,
  replacement: S.optional(shortReplacement),
})

const SurvivedMutant = S.Struct({
  id: shortToken,
  mutatorName: shortToken,
  location: ReportLocation,
  status: S.Literal('Survived'),
  replacement: S.optional(shortReplacement),
})

/**
 * Either outcome for one mutant. A two-member union rather than one struct
 * with an eight-way status, so a generated mutant survives about half the
 * time and the survivor-presence filter below discards little.
 */
const ReportMutant = S.Union([NonSurvivedMutant, SurvivedMutant])

/**
 * At least one survivor in at most four mutants. The length bounds guide
 * construction; the predicate stays law and rejects the all-killed draws.
 */
const SurvivingMutants = S.Array(ReportMutant).check(
  S.isMinLength(1),
  S.isMaxLength(4),
  S.makeFilter(
    (mutants: ReadonlyArray<S.Schema.Type<typeof ReportMutant>>) =>
      mutants.some((mutant) => mutant.status === 'Survived'),
    { arbitraryConstraint: { minLength: 1, maxLength: 4 } },
  ),
)

const SurvivingFile = S.Struct({
  language: S.Literal('javascript'),
  source: ContentText,
  mutants: SurvivingMutants,
})

const NonSurvivingFile = S.Struct({
  language: S.Literal('javascript'),
  source: ContentText,
  mutants: S.Array(NonSurvivedMutant).check(S.isMaxLength(3)),
})

/** Exactly one file, and its mutants satisfy the survivor filter above. */
const SurvivingFiles = S.Record(fileKey, SurvivingFile).check(
  S.isMinProperties(1),
  S.isMaxProperties(1),
)

const NonSurvivingFiles = S.Record(shortKey, NonSurvivingFile).check(S.isMaxProperties(3))

/** Keys stay short so `survivorsPriorReport` can never be generated. */
const CleanConfig = S.Record(shortKey, S.Union([shortConfigText, S.Int, S.Boolean])).check(
  S.isMaxProperties(3),
)

const Thresholds = S.Struct({ high: S.Int, low: S.Int })

const Framework = S.Struct({ name: S.Literal('stryker'), version: frameworkVersionText })

export const ReportWithSurvivors = S.Struct({
  config: CleanConfig,
  schemaVersion: S.Literal('1'),
  thresholds: Thresholds,
  framework: Framework,
  files: SurvivingFiles,
})

export const ReportWithoutSurvivors = S.Struct({
  config: CleanConfig,
  schemaVersion: S.Literal('1'),
  thresholds: Thresholds,
  framework: Framework,
  files: NonSurvivingFiles,
})

export const FrameworklessReport = S.Struct({
  config: CleanConfig,
  schemaVersion: S.Literal('1'),
  thresholds: Thresholds,
  files: SurvivingFiles,
})

/**
 * A report written by a survivors run embeds the bookkeeping key in its
 * `config`. The marker is the only load-bearing key — both sides of the
 * admission comparison strip it before hashing — so no other keys are needed.
 */
export const SurvivorsProducedReport = S.Struct({
  config: S.Struct({ survivorsPriorReport: S.Literal('reports/prior.json') }),
  schemaVersion: S.Literal('1'),
  thresholds: Thresholds,
  framework: Framework,
  files: SurvivingFiles,
})

export const EitherReport = S.Union([ReportWithSurvivors, SurvivorsProducedReport])

export const PartialSurvivor = S.Struct({ id: S.String, fileName: S.String })

export const MalformedLocation = S.Union([
  S.Struct({}),
  S.Struct({ start: S.Struct({}), end: ReportPosition }),
  S.Struct({ start: ReportPosition, end: S.Struct({}) }),
])

export const SurvivorFields = S.Struct({
  id: S.NonEmptyString,
  fileName: S.NonEmptyString,
  mutatorName: S.NonEmptyString,
  replacement: S.NonEmptyString,
})
