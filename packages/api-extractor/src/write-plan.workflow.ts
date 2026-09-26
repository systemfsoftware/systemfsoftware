import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import type { ReportOutcome } from './choose-extraction.workflow.js'
import { ReportEvidence, ReportOutcomeSchema } from './choose-extraction.workflow.js'
import type { LogLevel } from './collector/message-router.schema.js'
import { LogLevel as LogLevelSchema } from './collector/message-router.schema.js'
import { AbsolutePath } from './config/absolute-path.schema.js'
import { NewlineKind } from './config/config-file.schema.js'
import type { ConsoleTextLine, RenderedRollupText, TsdocMetadataWrite } from './write-plan.schema.js'
import { ExtractionMaterial } from './write-plan.schema.js'

const StepTypeId: unique symbol = Symbol.for('@systemfsoftware/api-extractor/WriteStep')
type StepTypeId = typeof StepTypeId

export class EmitLineStep extends Schema.TaggedClass<EmitLineStep>()('EmitLine', {
  level: LogLevelSchema,
  text: Schema.String,
}) {
  readonly [StepTypeId] = StepTypeId
}

export class EnsureDirectoryStep extends Schema.TaggedClass<EnsureDirectoryStep>()('EnsureDirectory', {
  directoryPath: AbsolutePath,
}) {
  readonly [StepTypeId] = StepTypeId
}

export class WriteFileStep extends Schema.TaggedClass<WriteFileStep>()('WriteFile', {
  filePath: AbsolutePath,
  content: Schema.String,
  newlineKind: NewlineKind,
}) {
  readonly [StepTypeId] = StepTypeId
}

export class ReportDiffStep extends Schema.TaggedClass<ReportDiffStep>()('ReportDiff', {
  level: LogLevelSchema,
  reportShortPath: Schema.String,
  reportTempShortPath: Schema.String,
  baselineContent: Schema.String,
  generatedText: Schema.String,
}) {
  readonly [StepTypeId] = StepTypeId
}

export class RefuseReportStep extends Schema.TaggedClass<RefuseReportStep>()('RefuseReport', {
  text: Schema.String,
}) {
  readonly [StepTypeId] = StepTypeId
}

export const WriteStep = Schema.Union([
  EmitLineStep,
  EnsureDirectoryStep,
  WriteFileStep,
  ReportDiffStep,
  RefuseReportStep,
])
export type WriteStep = Schema.Schema.Type<typeof WriteStep>

export const ReportTexts = Schema.Struct({
  generating: Schema.String,
  updated: Schema.String,
  drift: Schema.String,
  missing: Schema.String,
  created: Schema.String,
  folderMissing: Schema.String,
  unchanged: Schema.String,
})
export type ReportTexts = Schema.Schema.Type<typeof ReportTexts>

export const PlannedReport = Schema.Struct({
  evidence: ReportEvidence,
  texts: ReportTexts,
})
export type PlannedReport = Schema.Schema.Type<typeof PlannedReport>

export class WritePlanCommand extends Schema.TaggedClass<WritePlanCommand>()('WritePlanCommand', {
  ...ExtractionMaterial.fields,
  printApiReportDiff: Schema.Boolean,
  infoAdmitted: Schema.Boolean,
  verboseAdmitted: Schema.Boolean,
  preambleText: Schema.String,
  noticeText: Schema.NullOr(Schema.String),
  footerText: Schema.String,
  reports: Schema.Array(PlannedReport),
  outcomes: Schema.Array(ReportOutcomeSchema),
  succeeded: Schema.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

interface PlanDraft {
  readonly steps: Array<WriteStep>
}

const emit = (draft: PlanDraft, level: LogLevel, text: string): void => {
  draft.steps.push(EmitLineStep.make({ level, text }))
}

const ensure = (draft: PlanDraft, directoryPath: AbsolutePath): void => {
  draft.steps.push(EnsureDirectoryStep.make({ directoryPath }))
}

const write = (command: WritePlanCommand, draft: PlanDraft, filePath: AbsolutePath, content: string): void => {
  draft.steps.push(WriteFileStep.make({ filePath, content, newlineKind: command.newlineKind }))
}

const refuse = (draft: PlanDraft, text: string): void => {
  draft.steps.push(RefuseReportStep.make({ text }))
}

const writeLines = (draft: PlanDraft, lines: ReadonlyArray<ConsoleTextLine>): void => {
  Arr.forEach(lines, (line) => emit(draft, line.level, line.text))
}

const lineAdmitted = (command: WritePlanCommand, level: LogLevel): boolean =>
  Match.value(level).pipe(
    Match.when('info', () => command.infoAdmitted),
    Match.when('verbose', () => command.verboseAdmitted),
    Match.when('error', () => true),
    Match.when('warning', () => true),
    Match.when('none', () => false),
    Match.exhaustive,
  )

const admittedStep = (command: WritePlanCommand, step: WriteStep): boolean =>
  Match.value(step).pipe(
    Match.tag('EmitLine', (line) => lineAdmitted(command, line.level)),
    Match.tag('EnsureDirectory', () => true),
    Match.tag('WriteFile', () => true),
    Match.tag('ReportDiff', () => true),
    Match.tag('RefuseReport', () => true),
    Match.exhaustive,
  )

const showsDiff = (command: WritePlanCommand): boolean =>
  Match.value(command.printApiReportDiff).pipe(
    Match.when(true, () => true),
    Match.when(false, () => command.verboseAdmitted),
    Match.exhaustive,
  )

const diffLevel = (command: WritePlanCommand): LogLevel =>
  Match.value(command.printApiReportDiff).pipe(
    Match.when(true, (): LogLevel => 'warning'),
    Match.when(false, (): LogLevel => 'verbose'),
    Match.exhaustive,
  )

const writeDiff = (command: WritePlanCommand, draft: PlanDraft, plan: ReportEvidence): void => {
  Match.value(showsDiff(command)).pipe(
    Match.when(true, () =>
      Match.value(plan.baseline).pipe(
        Match.tag('BaselinePresent', (baseline) => {
          draft.steps.push(ReportDiffStep.make({
            level: diffLevel(command),
            reportShortPath: plan.reportShortPath,
            reportTempShortPath: plan.reportTempShortPath,
            baselineContent: baseline.content,
            generatedText: plan.generatedText,
          }))
        }),
        Match.tag('BaselineAbsent', () => undefined),
        Match.tag('BaselineUnreadable', () => undefined),
        Match.exhaustive,
      )),
    Match.when(false, () => undefined),
    Match.exhaustive,
  )
}

const writeGenerated = (
  command: WritePlanCommand,
  draft: PlanDraft,
  planned: PlannedReport,
): void => {
  const { evidence, texts } = planned
  emit(draft, 'verbose', texts.generating)
  ensure(draft, evidence.reportTempDirectory)
  write(command, draft, evidence.reportTempPath, evidence.generatedText)
}

const writeUpdated = (command: WritePlanCommand, draft: PlanDraft, planned: PlannedReport): void => {
  const { evidence, texts } = planned
  emit(draft, 'warning', texts.updated)
  ensure(draft, evidence.reportDirectory)
  write(command, draft, evidence.reportPath, evidence.generatedText)
  writeDiff(command, draft, evidence)
}

const writeDrifted = (command: WritePlanCommand, draft: PlanDraft, planned: PlannedReport): void => {
  emit(draft, 'warning', planned.texts.drift)
  writeDiff(command, draft, planned.evidence)
}

const writeMissing = (draft: PlanDraft, planned: PlannedReport): void => {
  emit(draft, 'warning', planned.texts.missing)
}

const writeCreated = (command: WritePlanCommand, draft: PlanDraft, planned: PlannedReport): void => {
  write(command, draft, planned.evidence.reportPath, planned.evidence.generatedText)
  emit(draft, 'warning', planned.texts.created)
}

const writeFolderMissing = (draft: PlanDraft, planned: PlannedReport): void => {
  emit(draft, 'error', planned.texts.folderMissing)
}

const writeOutcome = (
  command: WritePlanCommand,
  draft: PlanDraft,
  planned: PlannedReport,
  outcome: ReportOutcome,
): void => {
  Match.value(outcome).pipe(
    Match.tag('ReportUnchanged', () => emit(draft, 'verbose', planned.texts.unchanged)),
    Match.tag('ReportUpdated', () => writeUpdated(command, draft, planned)),
    Match.tag('ReportDriftRefused', () => writeDrifted(command, draft, planned)),
    Match.tag('ReportMissingRefused', () => writeMissing(draft, planned)),
    Match.tag('ReportCreated', () => writeCreated(command, draft, planned)),
    Match.tag('ReportFolderMissing', () => writeFolderMissing(draft, planned)),
    Match.tag('ReportBaselineUnreadable', (unreadable) => refuse(draft, unreadable.text)),
    Match.exhaustive,
  )
}

const writeReport = (
  command: WritePlanCommand,
  draft: PlanDraft,
  planned: PlannedReport,
  outcome: ReportOutcome,
): void => {
  writeGenerated(command, draft, planned)
  writeOutcome(command, draft, planned, outcome)
}

const writeRollup = (command: WritePlanCommand, draft: PlanDraft, rollup: RenderedRollupText): void => {
  emit(draft, 'verbose', rollup.lineText)
  ensure(draft, rollup.directoryPath)
  write(command, draft, rollup.filePath, rollup.content)
}

const writeTsdocMetadata = (command: WritePlanCommand, draft: PlanDraft, target: TsdocMetadataWrite): void => {
  ensure(draft, target.directoryPath)
  write(command, draft, target.filePath, target.content)
}

const writeFooter = (command: WritePlanCommand, draft: PlanDraft): void => {
  Match.value(command.succeeded).pipe(
    Match.when(true, () => emit(draft, 'info', command.footerText)),
    Match.when(false, () => undefined),
    Match.exhaustive,
  )
}

const buildWritePlan = (command: WritePlanCommand): ReadonlyArray<WriteStep> => {
  const draft: PlanDraft = { steps: [] }
  emit(draft, 'info', command.preambleText)
  Arr.forEach(Option.toArray(Option.fromNullishOr(command.noticeText)), (text) => emit(draft, 'info', text))
  writeLines(draft, command.consoleLines)
  Arr.forEach(command.rollups, (rollup) => writeRollup(command, draft, rollup))
  Arr.forEach(command.tsdocMetadata, (target) => writeTsdocMetadata(command, draft, target))
  Arr.forEach(
    Arr.zip(command.reports, command.outcomes),
    ([planned, outcome]) => writeReport(command, draft, planned, outcome),
  )
  writeLines(draft, command.residueLines)
  writeFooter(command, draft)
  return Arr.filter(draft.steps, (step) => admittedStep(command, step))
}

export const writePlan = Workflow.make({
  command: WritePlanCommand,
  decision: Schema.Array(WriteStep),
  error: Schema.Never,
  decide: (command: WritePlanCommand): Result.Result<ReadonlyArray<WriteStep>, never> =>
    Result.succeed(buildWritePlan(command)),
})
