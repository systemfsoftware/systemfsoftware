import { it } from '@systemfsoftware/vitest'
import { Equal, Match } from 'effect'
import * as Result from 'effect/Result'

import {
  chooseExtraction,
  DecideExtraction,
  type ExtractionDecision,
  ReportCreated,
  ReportDriftRefused,
  type ReportEvidence,
  ReportFolderMissing,
  ReportMissingRefused,
  type ReportOutcome,
  ReportUnchanged,
  ReportUpdated,
} from '../choose-extraction.workflow.js'

const decisionOf = (choose: typeof chooseExtraction, command: DecideExtraction): ExtractionDecision =>
  choose(command).pipe(Result.merge)

const identityOf = (evidence: ReportEvidence) => ({
  variant: evidence.variant,
  reportFileName: evidence.reportFileName,
  reportTempPath: evidence.reportTempPath,
  reportPath: evidence.reportPath,
  generatedText: evidence.generatedText,
})

const normalizedContent = (content: string): string => content.replace(/\s+/g, ' ')

const outcomeOf = (evidence: ReportEvidence, localBuild: boolean): ReportOutcome =>
  Match.value(evidence.baseline).pipe(
    Match.tag('BaselinePresent', (baseline) =>
      Match.value(normalizedContent(evidence.generatedText) === normalizedContent(baseline.content)).pipe(
        Match.when(true, () =>
          ReportUnchanged.make(identityOf(evidence))),
        Match.when(false, () =>
          Match.value(localBuild).pipe(
            Match.when(true, () => ReportUpdated.make(identityOf(evidence))),
            Match.when(false, () => ReportDriftRefused.make(identityOf(evidence))),
            Match.exhaustive,
          )),
        Match.exhaustive,
      )),
    Match.tag('BaselineAbsent', () =>
      Match.value(localBuild).pipe(
        Match.when(false, () =>
          ReportMissingRefused.make(identityOf(evidence))),
        Match.when(true, () =>
          Match.value(evidence.folder).pipe(
            Match.tag('FolderPresent', () => ReportCreated.make(identityOf(evidence))),
            Match.tag('FolderAbsent', () => ReportFolderMissing.make(identityOf(evidence))),
            Match.exhaustive,
          )),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const expectedOutcomesOf = (command: DecideExtraction): ReadonlyArray<ReportOutcome> =>
  command.reports.map((evidence) => outcomeOf(evidence, command.localBuild))

const tagOfOutcome = (outcome: ReportOutcome): string =>
  Match.value(outcome).pipe(
    Match.tag('ReportUnchanged', () => 'ReportUnchanged'),
    Match.tag('ReportUpdated', () => 'ReportUpdated'),
    Match.tag('ReportCreated', () => 'ReportCreated'),
    Match.tag('ReportDriftRefused', () => 'ReportDriftRefused'),
    Match.tag('ReportMissingRefused', () => 'ReportMissingRefused'),
    Match.tag('ReportFolderMissing', () => 'ReportFolderMissing'),
    Match.exhaustive,
  )

const tagsOf = (outcomes: ReadonlyArray<ReportOutcome>): ReadonlyArray<string> => outcomes.map(tagOfOutcome)

const driftsOf = (tags: ReadonlyArray<string>): number =>
  tags.filter((tag) => tag === 'ReportUpdated' || tag === 'ReportDriftRefused').length

const warnsOf = (tag: string): boolean => tag !== 'ReportUnchanged' && tag !== 'ReportFolderMissing'

const expectedCountsOf = (
  command: DecideExtraction,
): { readonly errorCount: number; readonly warningCount: number } => {
  const tags = tagsOf(expectedOutcomesOf(command))
  return {
    errorCount: command.residue.errors + tags.filter((tag) => tag === 'ReportFolderMissing').length,
    warningCount: command.residue.warnings + tags.filter(warnsOf).length +
      (command.printApiReportDiff ? driftsOf(tags) : 0),
  }
}

const expectedPassesOf = (
  command: DecideExtraction,
  counts: { readonly errorCount: number; readonly warningCount: number },
): boolean =>
  Match.value(command.localBuild).pipe(
    Match.when(true, () => counts.errorCount === 0),
    Match.when(false, () => counts.errorCount + counts.warningCount === 0),
    Match.exhaustive,
  )

const passedOf = (decision: ExtractionDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('ExtractionPassed', () => true),
    Match.tag('ExtractionFailed', () => false),
    Match.exhaustive,
  )

it.prop(
  '∀c_Outcomes_≡TruthTable',
  { of: [DecideExtraction], subject: chooseExtraction },
  (subject, [command]) => Equal.equals(decisionOf(subject, command).outcomes, expectedOutcomesOf(command)),
)

it.prop(
  '∀c_Counts_≡ResiduePlusOutcomes',
  { of: [DecideExtraction], subject: chooseExtraction },
  (subject, [command]) => {
    const decision = decisionOf(subject, command)
    const expected = expectedCountsOf(command)
    return decision.errorCount === expected.errorCount && decision.warningCount === expected.warningCount
  },
)

it.prop('∀c_Pass_≡CountRule', { of: [DecideExtraction], subject: chooseExtraction }, (subject, [command]) => {
  const decision = decisionOf(subject, command)
  return passedOf(decision) === expectedPassesOf(command, expectedCountsOf(command))
})
