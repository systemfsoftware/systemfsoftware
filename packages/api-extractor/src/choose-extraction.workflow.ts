/// <reference types="vitest/importMeta" />
import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { AbsolutePath } from './config/absolute-path.schema.js'
import { ApiReportVariant } from './config/config-file.schema.js'
import { ExtractionMaterial } from './write-plan.schema.js'

/** A residue tally: a count of messages, so a non-negative safe integer. */
const ResidueCount = Schema.Natural

const DecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/api-extractor/ExtractionDecision')
type DecisionTypeId = typeof DecisionTypeId

/** A baseline report file was read, so drift can be judged against it. */
export const BaselinePresent = Schema.TaggedStruct('BaselinePresent', {
  content: Schema.String,
})
export type BaselinePresent = typeof BaselinePresent.Type

/** No baseline report file sits at the expected path. */
export const BaselineAbsent = Schema.TaggedStruct('BaselineAbsent', {})
export type BaselineAbsent = typeof BaselineAbsent.Type

export const BaselineUnreadable = Schema.TaggedStruct('BaselineUnreadable', {
  text: Schema.String,
})
export type BaselineUnreadable = typeof BaselineUnreadable.Type

export type BaselineEvidence = BaselinePresent | BaselineAbsent | BaselineUnreadable

/** The folder the report would be written into exists. */
export const FolderPresent = Schema.TaggedStruct('FolderPresent', {})
export type FolderPresent = typeof FolderPresent.Type

/** The folder the report would be written into is missing. */
export const FolderAbsent = Schema.TaggedStruct('FolderAbsent', {})
export type FolderAbsent = typeof FolderAbsent.Type

export type FolderEvidence = FolderPresent | FolderAbsent

/** One report variant's evidence: where it lives, what was generated, and what the disk holds. */
export const ReportEvidence = Schema.TaggedStruct('ReportEvidence', {
  variant: ApiReportVariant,
  reportFileName: Schema.String,
  reportTempPath: AbsolutePath,
  reportPath: AbsolutePath,
  reportShortPath: Schema.String,
  reportTempShortPath: Schema.String,
  reportDirectory: AbsolutePath,
  reportTempDirectory: AbsolutePath,
  generatedText: Schema.String,
  baseline: Schema.Union([BaselinePresent, BaselineAbsent, BaselineUnreadable]),
  folder: Schema.Union([FolderPresent, FolderAbsent]),
})
export type ReportEvidence = typeof ReportEvidence.Type

const outcomeFields = {
  variant: ApiReportVariant,
  reportFileName: Schema.String,
  reportTempPath: AbsolutePath,
  reportPath: AbsolutePath,
  generatedText: Schema.String,
}

/** Baseline present and equivalent: nothing to do. */
export const ReportUnchanged = Schema.TaggedStruct('ReportUnchanged', outcomeFields)
export type ReportUnchanged = typeof ReportUnchanged.Type

/** Baseline present, drifted, local build: the report is rewritten. */
export const ReportUpdated = Schema.TaggedStruct('ReportUpdated', outcomeFields)
export type ReportUpdated = typeof ReportUpdated.Type

/** Baseline absent, folder present, local build: the report is created. */
export const ReportCreated = Schema.TaggedStruct('ReportCreated', outcomeFields)
export type ReportCreated = typeof ReportCreated.Type

/** Baseline present, drifted, verification build: the report is refused, untouched. */
export const ReportDriftRefused = Schema.TaggedStruct('ReportDriftRefused', outcomeFields)
export type ReportDriftRefused = typeof ReportDriftRefused.Type

/** Baseline absent, verification build: the report is refused. */
export const ReportMissingRefused = Schema.TaggedStruct('ReportMissingRefused', outcomeFields)
export type ReportMissingRefused = typeof ReportMissingRefused.Type

/** Baseline absent, folder absent, local build: refused with an error, nothing can be written. */
export const ReportFolderMissing = Schema.TaggedStruct('ReportFolderMissing', outcomeFields)
export type ReportFolderMissing = typeof ReportFolderMissing.Type

/** The baseline could not be read: the write phase refuses with upstream's rendered failure text. */
export const ReportBaselineUnreadable = Schema.TaggedStruct('ReportBaselineUnreadable', {
  ...outcomeFields,
  text: Schema.String,
})
export type ReportBaselineUnreadable = typeof ReportBaselineUnreadable.Type

export const ReportOutcomeSchema = Schema.Union([
  ReportUnchanged,
  ReportUpdated,
  ReportCreated,
  ReportDriftRefused,
  ReportMissingRefused,
  ReportFolderMissing,
  ReportBaselineUnreadable,
])

export type ReportOutcome =
  | ReportUnchanged
  | ReportUpdated
  | ReportCreated
  | ReportDriftRefused
  | ReportMissingRefused
  | ReportFolderMissing
  | ReportBaselineUnreadable

/** The read phase's command: every report's evidence, the routed console residue counts, and the material the write plan is built from. */
export class DecideExtraction extends Schema.TaggedClass<DecideExtraction>()('DecideExtraction', {
  localBuild: Schema.Boolean,
  printApiReportDiff: Schema.Boolean,
  residue: Schema.Struct({
    errors: ResidueCount,
    warnings: ResidueCount,
  }),
  reports: Schema.Array(ReportEvidence),
  material: ExtractionMaterial,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

/** The run passed: a local build with no errors, or a verification build with no errors and no warnings. */
export class ExtractionPassed extends Schema.TaggedClass<ExtractionPassed>()('ExtractionPassed', {
  outcomes: Schema.Array(ReportOutcomeSchema),
  errorCount: ResidueCount,
  warningCount: ResidueCount,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

/** The run failed under the pass rule. */
export class ExtractionFailed extends Schema.TaggedClass<ExtractionFailed>()('ExtractionFailed', {
  outcomes: Schema.Array(ReportOutcomeSchema),
  errorCount: ResidueCount,
  warningCount: ResidueCount,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export const ExtractionDecision = Schema.Union([ExtractionPassed, ExtractionFailed])
export type ExtractionDecision = typeof ExtractionDecision.Type

const outcomeIdentity = (evidence: ReportEvidence) => ({
  variant: evidence.variant,
  reportFileName: evidence.reportFileName,
  reportTempPath: evidence.reportTempPath,
  reportPath: evidence.reportPath,
  generatedText: evidence.generatedText,
})

const unchangedOf = (evidence: ReportEvidence): ReportOutcome => ({
  _tag: 'ReportUnchanged',
  ...outcomeIdentity(evidence),
})

const updatedOf = (evidence: ReportEvidence): ReportOutcome => ({
  _tag: 'ReportUpdated',
  ...outcomeIdentity(evidence),
})

const createdOf = (evidence: ReportEvidence): ReportOutcome => ({
  _tag: 'ReportCreated',
  ...outcomeIdentity(evidence),
})

const driftRefusedOf = (evidence: ReportEvidence): ReportOutcome => ({
  _tag: 'ReportDriftRefused',
  ...outcomeIdentity(evidence),
})

const missingRefusedOf = (evidence: ReportEvidence): ReportOutcome => ({
  _tag: 'ReportMissingRefused',
  ...outcomeIdentity(evidence),
})

const folderMissingOf = (evidence: ReportEvidence): ReportOutcome => ({
  _tag: 'ReportFolderMissing',
  ...outcomeIdentity(evidence),
})

const unreadableOf = (evidence: ReportEvidence, text: string): ReportOutcome => ({
  _tag: 'ReportBaselineUnreadable',
  ...outcomeIdentity(evidence),
  text,
})

/** The absent-baseline half of the truth table. */
const absentOutcome = (evidence: ReportEvidence, localBuild: boolean): ReportOutcome =>
  Match.value(localBuild).pipe(
    Match.when(false, () => missingRefusedOf(evidence)),
    Match.when(true, () =>
      Match.value(evidence.folder).pipe(
        Match.tag('FolderPresent', () => createdOf(evidence)),
        Match.tag('FolderAbsent', () => folderMissingOf(evidence)),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const areEquivalentApiFileContents = (generatedText: string, baselineContent: string): boolean =>
  generatedText.replace(/\s+/g, ' ') === baselineContent.replace(/\s+/g, ' ')

/** One report's outcome, the truth table in one function. */
const outcomeOf = (evidence: ReportEvidence, localBuild: boolean): ReportOutcome =>
  Match.value(evidence.baseline).pipe(
    Match.tag('BaselinePresent', (baseline) =>
      Match.value(areEquivalentApiFileContents(evidence.generatedText, baseline.content)).pipe(
        Match.when(true, () =>
          unchangedOf(evidence)),
        Match.when(false, () =>
          Match.value(localBuild).pipe(
            Match.when(true, () => updatedOf(evidence)),
            Match.when(false, () => driftRefusedOf(evidence)),
            Match.exhaustive,
          )),
        Match.exhaustive,
      )),
    Match.tag('BaselineAbsent', () =>
      absentOutcome(evidence, localBuild)),
    Match.tag('BaselineUnreadable', (baseline) => unreadableOf(evidence, baseline.text)),
    Match.exhaustive,
  )

const isUnchanged = Schema.is(ReportUnchanged)

const isFolderMissing = Schema.is(ReportFolderMissing)

const isBaselineUnreadable = Schema.is(ReportBaselineUnreadable)

const isDriftRefused = Schema.is(ReportDriftRefused)

const isUpdated = Schema.is(ReportUpdated)

const countOf = (outcomes: ReadonlyArray<ReportOutcome>, matches: (outcome: ReportOutcome) => boolean): number =>
  Arr.filter(outcomes, matches).length

const driftCountOf = (outcomes: ReadonlyArray<ReportOutcome>): number =>
  countOf(outcomes, isDriftRefused) + countOf(outcomes, isUpdated)

const diffWarningCountOf = (command: DecideExtraction, outcomes: ReadonlyArray<ReportOutcome>): number =>
  Match.value(command.printApiReportDiff).pipe(
    Match.when(true, () => driftCountOf(outcomes)),
    Match.when(false, () => 0),
    Match.exhaustive,
  )

const errorCountOf = (command: DecideExtraction, outcomes: ReadonlyArray<ReportOutcome>): number =>
  command.residue.errors +
  countOf(outcomes, isFolderMissing) +
  countOf(outcomes, isBaselineUnreadable)

/**
 * Routed residue warnings, plus one warning per report outcome that is not silent, plus one diff
 * warning per drifted report when `--print-api-report-diff` is set.
 */
const warningCountOf = (command: DecideExtraction, outcomes: ReadonlyArray<ReportOutcome>): number =>
  command.residue.warnings +
  outcomes.length -
  countOf(outcomes, isUnchanged) -
  countOf(outcomes, isFolderMissing) -
  countOf(outcomes, isBaselineUnreadable) +
  diffWarningCountOf(command, outcomes)

/** Upstream's pass rule: local fails on errors; verification fails on errors or warnings. */
const passes = (command: DecideExtraction, errorCount: number, warningCount: number): boolean =>
  Match.value(command.localBuild).pipe(
    Match.when(true, () => errorCount === 0),
    Match.when(false, () => errorCount + warningCount === 0),
    Match.exhaustive,
  )

export const chooseExtraction = Workflow.make({
  command: DecideExtraction,
  decision: ExtractionDecision,
  error: Schema.Never,
  decide: (command: DecideExtraction): Result.Result<ExtractionDecision, never> => {
    const outcomes = Arr.map(command.reports, (evidence) => outcomeOf(evidence, command.localBuild))
    const errorCount = errorCountOf(command, outcomes)
    const warningCount = warningCountOf(command, outcomes)
    return Result.succeed(
      Match.value(passes(command, errorCount, warningCount)).pipe(
        Match.when(true, () => ExtractionPassed.make({ outcomes, errorCount, warningCount })),
        Match.when(false, () => ExtractionFailed.make({ outcomes, errorCount, warningCount })),
        Match.exhaustive,
      ),
    )
  },
})

const decodesResidueCount = (count: number): boolean => Result.isSuccess(Schema.decodeResult(ResidueCount)(count))

const isNonNegativeSafeInteger = (count: number): boolean =>
  Arr.every([count >= 0, Number.isSafeInteger(count)], (holds) => holds)

const countRefusalSeeds = [
  -1,
  0,
  Number.MAX_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER + 1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
]

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this branch is
  // statically dead in the build and a static import would publish the test-only dependency.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀n_ResidueCountRefusal_≡NonNegativeSafeInteger',
    { of: [Schema.Finite], subject: decodesResidueCount },
    (subject, [count]) =>
      Arr.every(
        Arr.append(countRefusalSeeds, count),
        (candidate) => subject(candidate) === isNonNegativeSafeInteger(candidate),
      ),
  )
}
