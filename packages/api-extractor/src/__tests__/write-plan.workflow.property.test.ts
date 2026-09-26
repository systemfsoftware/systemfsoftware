import { it } from '@systemfsoftware/vitest'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import type { ReportOutcome } from '../choose-extraction.workflow.js'
import { ReportEvidence } from '../choose-extraction.workflow.js'
import type { LogLevel } from '../collector/message-router.schema.js'
import type { RenderedRollupText, TsdocMetadataWrite } from '../write-plan.schema.js'
import {
  EmitLineStep,
  type PlannedReport,
  RefuseReportStep,
  type ReportTexts,
  writePlan,
  WritePlanCommand,
  type WriteStep,
} from '../write-plan.workflow.js'

interface StepSignature {
  readonly tag: WriteStep['_tag']
  readonly level: LogLevel | null
  readonly detail: string
}

const lineSignature = (level: LogLevel, text: string): StepSignature => ({ tag: 'EmitLine', level, detail: text })

const directorySignature = (directoryPath: string): StepSignature => ({
  tag: 'EnsureDirectory',
  level: null,
  detail: directoryPath,
})

const fileSignature = (filePath: string): StepSignature => ({ tag: 'WriteFile', level: null, detail: filePath })

const diffSignature = (level: LogLevel): StepSignature => ({ tag: 'ReportDiff', level, detail: level })

const refusalSignature = (text: string): StepSignature => ({ tag: 'RefuseReport', level: null, detail: text })

const signatureOf = (step: WriteStep): StepSignature =>
  Match.value(step).pipe(
    Match.tag('EmitLine', (line): StepSignature => lineSignature(line.level, line.text)),
    Match.tag('EnsureDirectory', (directory): StepSignature => directorySignature(directory.directoryPath)),
    Match.tag('WriteFile', (file): StepSignature => fileSignature(file.filePath)),
    Match.tag('ReportDiff', (diff): StepSignature => diffSignature(diff.level)),
    Match.tag('RefuseReport', (refusal): StepSignature => refusalSignature(refusal.text)),
    Match.exhaustive,
  )

const actualSignaturesOf = (steps: ReadonlyArray<WriteStep>): ReadonlyArray<StepSignature> =>
  Arr.map(steps, signatureOf)

const nonLineSignatures = (signatures: ReadonlyArray<StepSignature>): ReadonlyArray<StepSignature> =>
  Arr.filter(signatures, (signature) => signature.level === null)

const isDrifted = (outcome: ReportOutcome): boolean =>
  Match.value(outcome).pipe(
    Match.tag('ReportUpdated', () => true),
    Match.tag('ReportDriftRefused', () => true),
    Match.tag('ReportUnchanged', () => false),
    Match.tag('ReportCreated', () => false),
    Match.tag('ReportMissingRefused', () => false),
    Match.tag('ReportFolderMissing', () => false),
    Match.tag('ReportBaselineUnreadable', () => false),
    Match.exhaustive,
  )

const baselineIsPresent = (report: ReportEvidence): boolean =>
  Match.value(report.baseline).pipe(
    Match.tag('BaselinePresent', () => true),
    Match.tag('BaselineAbsent', () => false),
    Match.tag('BaselineUnreadable', () => false),
    Match.exhaustive,
  )

const diffLevelOf = (command: WritePlanCommand): LogLevel =>
  Match.value(command.printApiReportDiff).pipe(
    Match.when(true, (): LogLevel => 'warning'),
    Match.when(false, (): LogLevel => 'verbose'),
    Match.exhaustive,
  )

const showsDiffOf = (command: WritePlanCommand): boolean =>
  Match.value(command.printApiReportDiff).pipe(
    Match.when(true, () => true),
    Match.when(false, () => command.verboseAdmitted),
    Match.exhaustive,
  )

const updatedDiffOf = (command: WritePlanCommand, outcome: ReportOutcome): ReadonlyArray<StepSignature> =>
  Match.value(isDrifted(outcome)).pipe(
    Match.when(true, (): ReadonlyArray<StepSignature> => [diffSignature(diffLevelOf(command))]),
    Match.when(false, (): ReadonlyArray<StepSignature> => []),
    Match.exhaustive,
  )

const driftedDiffOf = (
  command: WritePlanCommand,
  report: ReportEvidence,
  outcome: ReportOutcome,
): ReadonlyArray<StepSignature> =>
  Match.value(baselineIsPresent(report)).pipe(
    Match.when(true, () => updatedDiffOf(command, outcome)),
    Match.when(false, (): ReadonlyArray<StepSignature> => []),
    Match.exhaustive,
  )

const diffSignaturesOf = (
  command: WritePlanCommand,
  report: ReportEvidence,
  outcome: ReportOutcome,
): ReadonlyArray<StepSignature> =>
  Match.value(showsDiffOf(command)).pipe(
    Match.when(true, () => driftedDiffOf(command, report, outcome)),
    Match.when(false, (): ReadonlyArray<StepSignature> => []),
    Match.exhaustive,
  )

const outcomeSignaturesOf = (
  command: WritePlanCommand,
  planned: PlannedReport,
  outcome: ReportOutcome,
): ReadonlyArray<StepSignature> =>
  Match.value(outcome).pipe(
    Match.tag('ReportUnchanged', (): ReadonlyArray<StepSignature> => [
      lineSignature('verbose', planned.texts.unchanged),
    ]),
    Match.tag('ReportUpdated', (): ReadonlyArray<StepSignature> => [
      lineSignature('warning', planned.texts.updated),
      directorySignature(planned.evidence.reportDirectory),
      fileSignature(planned.evidence.reportPath),
      ...diffSignaturesOf(command, planned.evidence, outcome),
    ]),
    Match.tag('ReportDriftRefused', (): ReadonlyArray<StepSignature> => [
      lineSignature('warning', planned.texts.drift),
      ...diffSignaturesOf(command, planned.evidence, outcome),
    ]),
    Match.tag('ReportMissingRefused', (): ReadonlyArray<StepSignature> => [
      lineSignature('warning', planned.texts.missing),
    ]),
    Match.tag('ReportCreated', (): ReadonlyArray<StepSignature> => [
      fileSignature(planned.evidence.reportPath),
      lineSignature('warning', planned.texts.created),
    ]),
    Match.tag('ReportFolderMissing', (): ReadonlyArray<StepSignature> => [
      lineSignature('error', planned.texts.folderMissing),
    ]),
    Match.tag('ReportBaselineUnreadable', (unreadable): ReadonlyArray<StepSignature> => [
      refusalSignature(unreadable.text),
    ]),
    Match.exhaustive,
  )

const reportSignaturesOf = (
  command: WritePlanCommand,
  planned: PlannedReport,
  outcome: ReportOutcome,
): ReadonlyArray<StepSignature> => [
  lineSignature('verbose', planned.texts.generating),
  directorySignature(planned.evidence.reportTempDirectory),
  fileSignature(planned.evidence.reportTempPath),
  ...outcomeSignaturesOf(command, planned, outcome),
]

const rollupSignaturesOf = (rollup: RenderedRollupText): ReadonlyArray<StepSignature> => [
  lineSignature('verbose', rollup.lineText),
  directorySignature(rollup.directoryPath),
  fileSignature(rollup.filePath),
]

const tsdocSignaturesOf = (target: TsdocMetadataWrite): ReadonlyArray<StepSignature> => [
  directorySignature(target.directoryPath),
  fileSignature(target.filePath),
]

const preambleSignaturesOf = (command: WritePlanCommand): ReadonlyArray<StepSignature> => [
  lineSignature('info', command.preambleText),
  ...Option.toArray(
    Option.map(Option.fromNullishOr(command.noticeText), (text) => lineSignature('info', text)),
  ),
]

const consoleSignaturesOf = (command: WritePlanCommand): ReadonlyArray<StepSignature> =>
  Arr.map(command.consoleLines, (line) => lineSignature(line.level, line.text))

const residueSignaturesOf = (command: WritePlanCommand): ReadonlyArray<StepSignature> =>
  Arr.map(command.residueLines, (line) => lineSignature(line.level, line.text))

const footerSignaturesOf = (command: WritePlanCommand): ReadonlyArray<StepSignature> =>
  Match.value(command.succeeded).pipe(
    Match.when(true, (): ReadonlyArray<StepSignature> => [lineSignature('info', command.footerText)]),
    Match.when(false, (): ReadonlyArray<StepSignature> => []),
    Match.exhaustive,
  )

const lineAdmitted = (command: WritePlanCommand, signature: StepSignature): boolean =>
  Match.value(signature.level).pipe(
    Match.when(null, () => true),
    Match.when('info', () => command.infoAdmitted),
    Match.when('verbose', () => command.verboseAdmitted),
    Match.when('error', () => true),
    Match.when('warning', () => true),
    Match.when('none', () => false),
    Match.exhaustive,
  )

const expectedSignaturesOf = (command: WritePlanCommand): ReadonlyArray<StepSignature> =>
  Arr.filter(
    [
      ...preambleSignaturesOf(command),
      ...consoleSignaturesOf(command),
      ...Arr.flatMap(command.rollups, rollupSignaturesOf),
      ...Arr.flatMap(command.tsdocMetadata, tsdocSignaturesOf),
      ...Arr.flatMap(command.reports, (planned, index) =>
        Arr.get(command.outcomes, index).pipe(
          Option.match({
            onNone: (): ReadonlyArray<StepSignature> => [],
            onSome: (outcome) => reportSignaturesOf(command, planned, outcome),
          }),
        )),
      ...residueSignaturesOf(command),
      ...footerSignaturesOf(command),
    ],
    (signature) => lineAdmitted(command, signature),
  )

const identityOf = (evidence: ReportEvidence) => ({
  variant: evidence.variant,
  reportFileName: evidence.reportFileName,
  reportTempPath: evidence.reportTempPath,
  reportPath: evidence.reportPath,
  generatedText: evidence.generatedText,
})

const textsOf = (evidence: ReportEvidence): ReportTexts => ({
  generating: `generating:${evidence.reportPath}`,
  updated: `updated:${evidence.reportShortPath}`,
  drift: `drift:${evidence.reportTempShortPath}`,
  missing: `missing:${evidence.reportShortPath}`,
  created: `created:${evidence.reportPath}`,
  folderMissing: `folder:${evidence.reportDirectory}`,
  unchanged: `unchanged:${evidence.reportTempShortPath}`,
})

const withUnreadableBaseline = (evidence: ReportEvidence, text: string): ReportEvidence => ({
  _tag: 'ReportEvidence',
  variant: evidence.variant,
  reportFileName: evidence.reportFileName,
  reportTempPath: evidence.reportTempPath,
  reportPath: evidence.reportPath,
  reportShortPath: evidence.reportShortPath,
  reportTempShortPath: evidence.reportTempShortPath,
  reportDirectory: evidence.reportDirectory,
  reportTempDirectory: evidence.reportTempDirectory,
  generatedText: evidence.generatedText,
  baseline: { _tag: 'BaselineUnreadable', text },
  folder: evidence.folder,
})

const revise = (
  command: WritePlanCommand,
  changes: Partial<Omit<WritePlanCommand, '_tag'>>,
): WritePlanCommand =>
  WritePlanCommand.make({
    verbosity: command.verbosity,
    newlineKind: command.newlineKind,
    compilerVersion: command.compilerVersion,
    compilerVersionNotice: command.compilerVersionNotice,
    consoleLines: command.consoleLines,
    residueLines: command.residueLines,
    rollups: command.rollups,
    tsdocMetadata: command.tsdocMetadata,
    printApiReportDiff: command.printApiReportDiff,
    infoAdmitted: command.infoAdmitted,
    verboseAdmitted: command.verboseAdmitted,
    preambleText: command.preambleText,
    noticeText: command.noticeText,
    footerText: command.footerText,
    reports: command.reports,
    outcomes: command.outcomes,
    succeeded: command.succeeded,
    ...changes,
  })

const singleRefusalRequest = (
  command: WritePlanCommand,
  report: ReportEvidence,
  text: string,
): WritePlanCommand =>
  revise(command, {
    infoAdmitted: true,
    verboseAdmitted: false,
    printApiReportDiff: false,
    succeeded: false,
    noticeText: null,
    consoleLines: [],
    residueLines: [],
    rollups: [],
    tsdocMetadata: [],
    reports: [{ evidence: withUnreadableBaseline(report, text), texts: textsOf(report) }],
    outcomes: [{ _tag: 'ReportBaselineUnreadable', ...identityOf(report), text }],
  })

it.prop(
  '∀p_StepSignatures_≡UpstreamOrder',
  { of: [WritePlanCommand], subject: writePlan },
  (subject, [command]) => {
    const outcome = subject(command)
    const steps = Result.getOrThrow(outcome)
    return JSON.stringify(actualSignaturesOf(steps)) === JSON.stringify(expectedSignaturesOf(command))
  },
)

it.prop(
  '∀p_Admission_≡LinesOnly',
  { of: [WritePlanCommand], subject: writePlan },
  (subject, [command]) => {
    const silentOutcome = subject(revise(command, { infoAdmitted: false, verboseAdmitted: false }))
    const loudOutcome = subject(revise(command, { infoAdmitted: true, verboseAdmitted: true }))
    const silent = Result.getOrThrow(silentOutcome)
    const loud = Result.getOrThrow(loudOutcome)
    return JSON.stringify(nonLineSignatures(actualSignaturesOf(silent))) ===
      JSON.stringify(nonLineSignatures(actualSignaturesOf(loud)))
  },
)

it.prop(
  '∀p_QuietCleanRun_⊥EmitLines',
  { of: [WritePlanCommand], subject: writePlan },
  (subject, [command]) => {
    const outcome = subject(revise(command, {
      infoAdmitted: false,
      verboseAdmitted: false,
      consoleLines: [],
      residueLines: [],
      rollups: [],
      tsdocMetadata: [],
      reports: [],
      outcomes: [],
    }))
    const steps = Result.getOrThrow(outcome)
    return Arr.filter(steps, Schema.is(EmitLineStep)).length === 0
  },
)

it.prop(
  '∀p_AdmittedPreamble_≡PlanHead',
  { of: [WritePlanCommand], subject: writePlan },
  (subject, [command]) => {
    const outcome = subject(revise(command, { infoAdmitted: true }))
    const steps = Result.getOrThrow(outcome)
    return Option.match(Arr.head(actualSignaturesOf(steps)), {
      onNone: () => false,
      onSome: (first) => first.tag === 'EmitLine' && first.level === 'info',
    })
  },
)

it.prop(
  '∀p_SucceededPlan_≡FooterTail',
  { of: [WritePlanCommand], subject: writePlan },
  (subject, [command]) => {
    const outcome = subject(revise(command, { succeeded: true, infoAdmitted: true }))
    const steps = Result.getOrThrow(outcome)
    return Option.match(Arr.last(actualSignaturesOf(steps)), {
      onNone: () => true,
      onSome: (last) => last.tag === 'EmitLine' && last.level === 'info',
    })
  },
)

it.prop(
  '∀p_UnreadableBaseline_⊨RefusalAfterPreamble',
  { of: [WritePlanCommand, ReportEvidence, Schema.String], subject: writePlan },
  (subject, [command, report, text]) => {
    const outcome = subject(singleRefusalRequest(command, report, text))
    const steps = Result.getOrThrow(outcome)
    return JSON.stringify(actualSignaturesOf(steps)) ===
      JSON.stringify([
        lineSignature('info', command.preambleText),
        directorySignature(report.reportTempDirectory),
        fileSignature(report.reportTempPath),
        refusalSignature(text),
      ])
  },
)

it.prop(
  '∀p_UnreadableReports_⊨OneRefusalEach',
  { of: [WritePlanCommand, ReportEvidence, Schema.String], subject: writePlan },
  (subject, [command, report, text]) => {
    const outcome = subject(singleRefusalRequest(command, report, text))
    const steps = Result.getOrThrow(outcome)
    const refusals = Arr.filter(steps, Schema.is(RefuseReportStep))
    return refusals.length === 1 && Arr.every(refusals, (refusal) => refusal.text === text)
  },
)
