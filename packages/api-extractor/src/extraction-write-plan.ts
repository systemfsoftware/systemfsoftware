import { formatPatch, structuredPatch } from 'diff'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'

import { convertToLf } from './analyzer/text.js'
import type { ReportEvidence, ReportOutcome } from './choose-extraction.workflow.js'
import { admits } from './collector/message-router.js'
import type { LogLevel } from './collector/message-router.schema.js'
import { convertNewlines } from './generators/index.js'
import type {
  ConsoleTextLine,
  EmitLineStep,
  EnsureDirectoryStep,
  ExtractionMaterial,
  RenderedRollupText,
  TsdocMetadataWrite,
  WriteFileStep,
  WritePlan,
} from './write-plan.schema.js'

export interface WritePlanInput extends ExtractionMaterial {
  readonly printApiReportDiff: boolean
  readonly reports: ReadonlyArray<ReportEvidence>
}

interface PlanDraft {
  readonly lines: Array<EmitLineStep>
  readonly directories: Array<EnsureDirectoryStep>
  readonly files: Array<WriteFileStep>
}

const emit = (draft: PlanDraft, level: LogLevel, text: string): void => {
  draft.lines.push({ _tag: 'EmitLine', level, text })
}

const ensure = (draft: PlanDraft, directoryPath: string): void => {
  draft.directories.push({ _tag: 'EnsureDirectory', directoryPath })
}

const write = (draft: PlanDraft, filePath: string, content: string): void => {
  draft.files.push({ _tag: 'WriteFile', filePath, content })
}

const writeLines = (_input: WritePlanInput, draft: PlanDraft, lines: ReadonlyArray<ConsoleTextLine>): void => {
  Arr.forEach(lines, (line) => emit(draft, line.level, line.text))
}

const showsDiff = (input: WritePlanInput): boolean => input.printApiReportDiff || admits(input.verbosity, 'verbose')

const diffLevel = (input: WritePlanInput): LogLevel => input.printApiReportDiff ? 'warning' : 'verbose'

const diffTextOf = (plan: ReportEvidence, baselineContent: string): string => {
  const patch = structuredPatch(
    plan.reportShortPath,
    plan.reportTempShortPath,
    convertToLf(baselineContent),
    plan.generatedText,
  )
  return `Changes to the API report:\n\n${formatPatch(patch)}`
}

const writeDiff = (input: WritePlanInput, draft: PlanDraft, plan: ReportEvidence): void => {
  if (showsDiff(input)) {
    Match.value(plan.baseline).pipe(
      Match.tag('BaselinePresent', (baseline) => emit(draft, diffLevel(input), diffTextOf(plan, baseline.content))),
      Match.tag('BaselineAbsent', () => undefined),
      Match.exhaustive,
    )
  }
}

const writeGenerated = (input: WritePlanInput, draft: PlanDraft, plan: ReportEvidence): void => {
  emit(draft, 'verbose', `Generating ${plan.variant} API report: ${plan.reportPath}`)
  ensure(draft, plan.reportTempDirectory)
  write(draft, plan.reportTempPath, convertNewlines(plan.generatedText, input.newlineKind))
}

const writeUpdated = (input: WritePlanInput, draft: PlanDraft, plan: ReportEvidence): void => {
  emit(draft, 'warning', `You have changed the API signature for this project. Updating ${plan.reportPath}`)
  ensure(draft, plan.reportDirectory)
  write(draft, plan.reportPath, convertNewlines(plan.generatedText, input.newlineKind))
  writeDiff(input, draft, plan)
}

const writeDrifted = (input: WritePlanInput, draft: PlanDraft, plan: ReportEvidence): void => {
  emit(
    draft,
    'warning',
    `You have changed the API signature for this project. Please copy the file "${plan.reportTempShortPath}"` +
      ` to "${plan.reportShortPath}", or perform a local build (which does this automatically).` +
      ` See the Git repo documentation for more info.`,
  )
  writeDiff(input, draft, plan)
}

const writeMissing = (draft: PlanDraft, plan: ReportEvidence): void => {
  emit(
    draft,
    'warning',
    `The API report file is missing. Please copy the file "${plan.reportTempShortPath}"` +
      ` to "${plan.reportShortPath}", or perform a local build (which does this automatically).` +
      ` See the Git repo documentation for more info.`,
  )
}

const writeCreated = (input: WritePlanInput, draft: PlanDraft, plan: ReportEvidence): void => {
  write(draft, plan.reportPath, convertNewlines(plan.generatedText, input.newlineKind))
  emit(
    draft,
    'warning',
    `The API report file was missing, so a new file was created. Please add this file to Git:\n${plan.reportPath}`,
  )
}

const writeFolderMissing = (draft: PlanDraft, plan: ReportEvidence): void => {
  emit(
    draft,
    'error',
    `Unable to create the API report file. Please make sure the target folder exists:\n${plan.reportDirectory}`,
  )
}

const writeOutcome = (
  input: WritePlanInput,
  draft: PlanDraft,
  plan: ReportEvidence,
  outcome: ReportOutcome,
): void => {
  Match.value(outcome).pipe(
    Match.tag(
      'ReportUnchanged',
      () => emit(draft, 'verbose', `The API report is up to date: ${plan.reportTempShortPath}`),
    ),
    Match.tag('ReportUpdated', () => writeUpdated(input, draft, plan)),
    Match.tag('ReportDriftRefused', () => writeDrifted(input, draft, plan)),
    Match.tag('ReportMissingRefused', () => writeMissing(draft, plan)),
    Match.tag('ReportCreated', () => writeCreated(input, draft, plan)),
    Match.tag('ReportFolderMissing', () => writeFolderMissing(draft, plan)),
    Match.exhaustive,
  )
}

const writeReport = (
  input: WritePlanInput,
  draft: PlanDraft,
  plan: ReportEvidence,
  outcome: ReportOutcome,
): void => {
  writeGenerated(input, draft, plan)
  writeOutcome(input, draft, plan, outcome)
}

const writeRollup = (input: WritePlanInput, draft: PlanDraft, rollup: RenderedRollupText): void => {
  emit(draft, 'verbose', `Writing declaration rollup: ${rollup.filePath}`)
  ensure(draft, rollup.directoryPath)
  write(draft, rollup.filePath, convertNewlines(rollup.content, input.newlineKind))
}

const writeTsdocMetadata = (input: WritePlanInput, draft: PlanDraft, target: TsdocMetadataWrite): void => {
  ensure(draft, target.directoryPath)
  write(draft, target.filePath, convertNewlines(target.content, input.newlineKind))
}

const footer = (succeeded: boolean): ReadonlyArray<ConsoleTextLine> =>
  Match.value(succeeded).pipe(
    Match.when(true, (): ReadonlyArray<ConsoleTextLine> => [
      { level: 'info', text: 'API Extractor completed successfully' },
    ]),
    Match.when(false, (): ReadonlyArray<ConsoleTextLine> => []),
    Match.exhaustive,
  )

/**
 * Builds the ordered write plan: the compiler preamble, the routed console lines, the rollups,
 * `tsdoc-metadata.json`, each report's writes and outcome lines with its diff, the residue, and
 * the success footer. Pure: the plan is data the write phase only executes.
 */
export const buildWritePlan = dual<
  (
    outcomes: ReadonlyArray<ReportOutcome>,
    succeeded: boolean,
  ) => (input: WritePlanInput) => WritePlan,
  (
    input: WritePlanInput,
    outcomes: ReadonlyArray<ReportOutcome>,
    succeeded: boolean,
  ) => WritePlan
>(3, (
  input: WritePlanInput,
  outcomes: ReadonlyArray<ReportOutcome>,
  succeeded: boolean,
): WritePlan => {
  const draft: PlanDraft = { lines: [], directories: [], files: [] }
  writeLines(input, draft, [
    { level: 'info', text: `Analysis will use the bundled TypeScript version ${input.compilerVersion}` },
  ])
  writeLines(input, draft, input.consoleLines)
  Arr.forEach(input.rollups, (rollup) => writeRollup(input, draft, rollup))
  Arr.forEach(input.tsdocMetadata, (target) => writeTsdocMetadata(input, draft, target))
  Arr.forEach(Arr.zip(input.reports, outcomes), ([plan, outcome]) => writeReport(input, draft, plan, outcome))
  writeLines(input, draft, input.residueLines)
  writeLines(input, draft, footer(succeeded))
  return {
    lines: Arr.filter(draft.lines, (line) => admits(input.verbosity, line.level)),
    directories: draft.directories,
    files: draft.files,
  }
})

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this branch is
  // statically dead in the build and a static import would publish the test-only dependency.
  const { it } = await import('@systemfsoftware/vitest')
  const { Schema } = await import('effect')
  const { ExtractionMaterial } = await import('./write-plan.schema.js')
  const { ReportEvidence, ReportUnchanged } = await import('./choose-extraction.workflow.js')

  const WritePlanRequest = Schema.Struct({
    ...ExtractionMaterial.fields,
    printApiReportDiff: Schema.Boolean,
  })

  const unchangedOf = (evidence: ReportEvidence) =>
    ReportUnchanged.make({
      variant: evidence.variant,
      reportFileName: evidence.reportFileName,
      reportTempPath: evidence.reportTempPath,
      reportPath: evidence.reportPath,
      generatedText: evidence.generatedText,
    })

  it.prop(
    '∀p_PlanLines_⊆Admitted',
    { of: [WritePlanRequest, ReportEvidence, Schema.Boolean], subject: buildWritePlan },
    (subject, [request, evidence, succeeded]) =>
      Arr.every(
        subject({ ...request, reports: [evidence] }, [unchangedOf(evidence)], succeeded).lines,
        (line) => admits(request.verbosity, line.level),
      ),
  )

  it.prop(
    '∀p_QuietCleanRun_⊥Lines',
    { of: [WritePlanRequest, ReportEvidence, Schema.Boolean], subject: buildWritePlan },
    (subject, [request, evidence, succeeded]) =>
      subject(
        {
          ...request,
          verbosity: 'silent',
          consoleLines: [],
          residueLines: [],
          rollups: [],
          tsdocMetadata: [],
          reports: [evidence],
        },
        [unchangedOf(evidence)],
        succeeded,
      ).lines.length === 0,
  )

  it.prop(
    '∀p_VerboseInfoLine_∈Plan',
    { of: [WritePlanRequest, Schema.String], subject: buildWritePlan },
    (subject, [request, text]) =>
      Arr.some(
        subject(
          { ...request, verbosity: 'verbose', consoleLines: [{ level: 'info', text }], reports: [] },
          [],
          true,
        ).lines,
        (line) => line.text === text,
      ),
  )
}
