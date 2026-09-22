import { it } from '@effect/vitest'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import * as Arbitrary from 'effect/unstable/arbitrary/Arbitrary'

import {
  BaselineAbsent,
  BaselinePresent,
  chooseExtraction,
  DecideExtraction,
  type ExtractionDecision,
  FolderAbsent,
  FolderPresent,
  ReportEvidence,
  type ReportOutcome,
} from '../choose-extraction.workflow.js'
import { ApiReportGenerator } from '../generators/api-report-generator.js'

const holds = (clauses: ReadonlyArray<boolean>): boolean => clauses.every((clause) => clause)

const BoundedCount = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 9 })))

const PresenceTag = Schema.Literals(['present', 'absent'])

const VariantName = Schema.Literals(['complete', 'beta', 'public'])

const evidenceArb = Arbitrary.map(
  Arbitrary.all([
    Arbitrary.schema(VariantName),
    Arbitrary.schema(Schema.String),
    Arbitrary.schema(Schema.String),
    Arbitrary.schema(Schema.String),
    Arbitrary.schema(Schema.String),
    Arbitrary.schema(Schema.String),
    Arbitrary.schema(Schema.Boolean),
    Arbitrary.schema(PresenceTag),
    Arbitrary.schema(PresenceTag),
  ]),
  ([
    variant,
    reportFileName,
    reportTempPath,
    reportPath,
    head,
    tail,
    drifted,
    baselineTag,
    folderTag,
  ]) => {
    const baselineText = `${head} ${tail}`
    const generatedText = drifted ? `${head} ${tail}/*mutant*/` : `${head}   ${tail}`
    return new ReportEvidence({
      variant,
      reportFileName,
      reportTempPath,
      reportPath,
      generatedText,
      baseline: Match.value(baselineTag).pipe(
        Match.when('present', () => new BaselinePresent({ content: baselineText })),
        Match.when('absent', () => new BaselineAbsent()),
        Match.exhaustive,
      ),
      folder: Match.value(folderTag).pipe(
        Match.when('present', () => new FolderPresent()),
        Match.when('absent', () => new FolderAbsent()),
        Match.exhaustive,
      ),
    })
  },
)

const commandArb = Arbitrary.map(
  Arbitrary.all([
    Arbitrary.schema(Schema.Boolean),
    Arbitrary.schema(Schema.Boolean),
    Arbitrary.schema(BoundedCount),
    Arbitrary.schema(BoundedCount),
    Arbitrary.array(evidenceArb, { maxLength: 4 }),
  ]),
  ([localBuild, printApiReportDiff, residueErrors, residueWarnings, reports]): DecideExtraction =>
    new DecideExtraction({
      localBuild,
      printApiReportDiff,
      residue: { errors: residueErrors, warnings: residueWarnings },
      reports,
    }),
)

const decisionOf = (command: DecideExtraction): ExtractionDecision => Result.merge(chooseExtraction(command))

const signatureOf = (content: string): string => content.replace(/\s+/g, ' ')

const specEquivalentOf = (evidence: ReportEvidence, baselineContent: string): boolean =>
  signatureOf(evidence.generatedText) === signatureOf(baselineContent)

const upstreamEquivalentOf = (evidence: ReportEvidence, baselineContent: string): boolean =>
  ApiReportGenerator.areEquivalentApiFileContents(evidence.generatedText, baselineContent)

type Equivalence = (evidence: ReportEvidence, baselineContent: string) => boolean

const expectedTagWith = (
  equivalent: Equivalence,
  evidence: ReportEvidence,
  localBuild: boolean,
): string =>
  Match.value(evidence.baseline).pipe(
    Match.tag('BaselinePresent', (baseline) =>
      Match.value(equivalent(evidence, baseline.content)).pipe(
        Match.when(true, () => 'ReportUnchanged'),
        Match.when(false, () =>
          Match.value(localBuild).pipe(
            Match.when(true, () => 'ReportUpdated'),
            Match.when(false, () => 'ReportDriftRefused'),
            Match.exhaustive,
          )),
        Match.exhaustive,
      )),
    Match.tag('BaselineAbsent', () =>
      Match.value(localBuild).pipe(
        Match.when(false, () => 'ReportMissingRefused'),
        Match.when(true, () =>
          Match.value(evidence.folder).pipe(
            Match.tag('FolderPresent', () => 'ReportCreated'),
            Match.tag('FolderAbsent', () => 'ReportFolderMissing'),
            Match.exhaustive,
          )),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const expectedTagOf = (evidence: ReportEvidence, localBuild: boolean): string =>
  expectedTagWith(specEquivalentOf, evidence, localBuild)

const upstreamTagOf = (evidence: ReportEvidence, localBuild: boolean): string =>
  expectedTagWith(upstreamEquivalentOf, evidence, localBuild)

const isDriftedTag = (tag: string): boolean => tag === 'ReportUpdated' || tag === 'ReportDriftRefused'

const expectedTagsOf = (command: DecideExtraction): ReadonlyArray<string> =>
  command.reports.map((evidence) => expectedTagOf(evidence, command.localBuild))

const diffWarningsOf = (command: DecideExtraction, tags: ReadonlyArray<string>): number =>
  Match.value(command.printApiReportDiff).pipe(
    Match.when(true, () => tags.filter((tag) => isDriftedTag(tag)).length),
    Match.when(false, () => 0),
    Match.exhaustive,
  )

const WARNING_TAGS: Readonly<Record<string, boolean>> = {
  ReportUnchanged: false,
  ReportUpdated: true,
  ReportCreated: true,
  ReportDriftRefused: true,
  ReportMissingRefused: true,
  ReportFolderMissing: false,
}

const expectedCountsOf = (
  command: DecideExtraction,
): { readonly errorCount: number; readonly warningCount: number } => {
  const tags = expectedTagsOf(command)
  return {
    errorCount: command.residue.errors + tags.filter((tag) => tag === 'ReportFolderMissing').length,
    warningCount: command.residue.warnings +
      tags.filter((tag) => WARNING_TAGS[tag] === true).length +
      diffWarningsOf(command, tags),
  }
}

const expectedPassedOf = (command: DecideExtraction): boolean => {
  const counts = expectedCountsOf(command)
  return Match.value(command.localBuild).pipe(
    Match.when(true, () => counts.errorCount === 0),
    Match.when(false, () => counts.errorCount + counts.warningCount === 0),
    Match.exhaustive,
  )
}

const passedOf = (decision: ExtractionDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('ExtractionPassed', () => true),
    Match.tag('ExtractionFailed', () => false),
    Match.exhaustive,
  )

it.prop('∀r_Outcome_≡TruthTableRow', [commandArb], ([command]) => {
  const decision = decisionOf(command)
  const expectedTags = expectedTagsOf(command)
  return decision.outcomes.length === command.reports.length &&
    command.reports.every((evidence, index) => {
      const outcome: ReportOutcome | undefined = decision.outcomes[index]
      return outcome !== undefined && holds([
        outcome._tag === expectedTags[index],
        outcome.variant === evidence.variant,
        outcome.reportFileName === evidence.reportFileName,
        outcome.reportTempPath === evidence.reportTempPath,
        outcome.reportPath === evidence.reportPath,
        outcome.generatedText === evidence.generatedText,
      ])
    })
})

it.prop('∀r_Outcome_≡UpstreamEquivalence', [commandArb], ([command]) => {
  const decision = decisionOf(command)
  return command.reports.every(
    (evidence, index) => decision.outcomes[index]?._tag === upstreamTagOf(evidence, command.localBuild),
  )
})

it.prop('∀c_Counts_≡Residue+Outcomes', [commandArb], ([command]) => {
  const decision = decisionOf(command)
  const expected = expectedCountsOf(command)
  return decision.errorCount === expected.errorCount && decision.warningCount === expected.warningCount
})

it.prop('∀c_Pass_≡Rule', [commandArb], ([command]) => passedOf(decisionOf(command)) === expectedPassedOf(command))
