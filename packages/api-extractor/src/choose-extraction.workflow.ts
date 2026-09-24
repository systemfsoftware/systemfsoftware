import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

const DecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/api-extractor/ExtractionDecision')
type DecisionTypeId = typeof DecisionTypeId

const OutcomeTypeId: unique symbol = Symbol.for('@systemfsoftware/api-extractor/ReportOutcome')
type OutcomeTypeId = typeof OutcomeTypeId

export class BaselinePresent extends Schema.TaggedClass<BaselinePresent>()('BaselinePresent', {
  content: Schema.String,
}) {}

export class BaselineAbsent extends Schema.TaggedClass<BaselineAbsent>()('BaselineAbsent', {}) {}

export type BaselineEvidence = BaselinePresent | BaselineAbsent

export class FolderPresent extends Schema.TaggedClass<FolderPresent>()('FolderPresent', {}) {}

export class FolderAbsent extends Schema.TaggedClass<FolderAbsent>()('FolderAbsent', {}) {}

export type FolderEvidence = FolderPresent | FolderAbsent

export class ReportEvidence extends Schema.TaggedClass<ReportEvidence>()('ReportEvidence', {
  variant: Schema.String,
  reportFileName: Schema.String,
  reportTempPath: Schema.String,
  reportPath: Schema.String,
  generatedText: Schema.String,
  baseline: Schema.Union([BaselinePresent, BaselineAbsent]),
  folder: Schema.Union([FolderPresent, FolderAbsent]),
}) {}

const outcomeFields = {
  variant: Schema.String,
  reportFileName: Schema.String,
  reportTempPath: Schema.String,
  reportPath: Schema.String,
  generatedText: Schema.String,
}

export class ReportUnchanged extends Schema.TaggedClass<ReportUnchanged>()('ReportUnchanged', outcomeFields) {
  readonly [OutcomeTypeId] = OutcomeTypeId
}

export class ReportUpdated extends Schema.TaggedClass<ReportUpdated>()('ReportUpdated', outcomeFields) {
  readonly [OutcomeTypeId] = OutcomeTypeId
}

export class ReportCreated extends Schema.TaggedClass<ReportCreated>()('ReportCreated', outcomeFields) {
  readonly [OutcomeTypeId] = OutcomeTypeId
}

export class ReportDriftRefused extends Schema.TaggedClass<ReportDriftRefused>()('ReportDriftRefused', outcomeFields) {
  readonly [OutcomeTypeId] = OutcomeTypeId
}

export class ReportMissingRefused
  extends Schema.TaggedClass<ReportMissingRefused>()('ReportMissingRefused', outcomeFields)
{
  readonly [OutcomeTypeId] = OutcomeTypeId
}

export class ReportFolderMissing
  extends Schema.TaggedClass<ReportFolderMissing>()('ReportFolderMissing', outcomeFields)
{
  readonly [OutcomeTypeId] = OutcomeTypeId
}

const ReportOutcomeSchema = Schema.Union([
  ReportUnchanged,
  ReportUpdated,
  ReportCreated,
  ReportDriftRefused,
  ReportMissingRefused,
  ReportFolderMissing,
])

export type ReportOutcome =
  | ReportUnchanged
  | ReportUpdated
  | ReportCreated
  | ReportDriftRefused
  | ReportMissingRefused
  | ReportFolderMissing

export class DecideExtraction extends Schema.TaggedClass<DecideExtraction>()('DecideExtraction', {
  localBuild: Schema.Boolean,
  printApiReportDiff: Schema.Boolean,
  residue: Schema.Struct({
    errors: Schema.Natural,
    warnings: Schema.Natural,
  }),
  reports: Schema.Array(ReportEvidence),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export class ExtractionPassed extends Schema.TaggedClass<ExtractionPassed>()('ExtractionPassed', {
  outcomes: Schema.Array(ReportOutcomeSchema),
  errorCount: Schema.Natural,
  warningCount: Schema.Natural,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class ExtractionFailed extends Schema.TaggedClass<ExtractionFailed>()('ExtractionFailed', {
  outcomes: Schema.Array(ReportOutcomeSchema),
  errorCount: Schema.Natural,
  warningCount: Schema.Natural,
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

const unchangedOf = (evidence: ReportEvidence): ReportOutcome => ReportUnchanged.make(outcomeIdentity(evidence))

const updatedOf = (evidence: ReportEvidence): ReportOutcome => ReportUpdated.make(outcomeIdentity(evidence))

const createdOf = (evidence: ReportEvidence): ReportOutcome => ReportCreated.make(outcomeIdentity(evidence))

const driftRefusedOf = (evidence: ReportEvidence): ReportOutcome => ReportDriftRefused.make(outcomeIdentity(evidence))

const missingRefusedOf = (evidence: ReportEvidence): ReportOutcome =>
  ReportMissingRefused.make(outcomeIdentity(evidence))

const folderMissingOf = (evidence: ReportEvidence): ReportOutcome => ReportFolderMissing.make(outcomeIdentity(evidence))

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

const normalizedContent = (content: string): string => content.replace(/\s+/g, ' ')

const equivalentToBaseline = (generatedText: string, baselineContent: string): boolean =>
  normalizedContent(generatedText) === normalizedContent(baselineContent)

const outcomeOf = (evidence: ReportEvidence, localBuild: boolean): ReportOutcome =>
  Match.value(evidence.baseline).pipe(
    Match.tag('BaselinePresent', (baseline) =>
      Match.value(equivalentToBaseline(evidence.generatedText, baseline.content)).pipe(
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
    Match.exhaustive,
  )

const isUnchanged = Schema.is(ReportUnchanged)

const isFolderMissing = Schema.is(ReportFolderMissing)

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
  command.residue.errors + countOf(outcomes, isFolderMissing)

const warningCountOf = (command: DecideExtraction, outcomes: ReadonlyArray<ReportOutcome>): number =>
  command.residue.warnings +
  outcomes.length -
  countOf(outcomes, isUnchanged) -
  countOf(outcomes, isFolderMissing) +
  diffWarningCountOf(command, outcomes)

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
