import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { formatPatch, structuredPatch } from 'diff'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Result from 'effect/Result'

import { convertToLf } from './analyzer/text.js'
import {
  BaselineAbsent,
  type BaselineEvidence,
  BaselinePresent,
  chooseExtraction,
  DecideExtraction,
  type ExtractionDecision,
  FolderAbsent,
  type FolderEvidence,
  FolderPresent,
  ReportEvidence,
  type ReportOutcome,
} from './choose-extraction.workflow.js'
import { Collector } from './collector/Collector.js'
import { MessageLog } from './collector/message-log.js'
import {
  admits,
  formatConsoleLine,
  makeMessageView,
  type MessageView,
  type ReportMessageSource,
} from './collector/message-router.js'
import { type LogLevel, MessageRuleError } from './collector/message-router.schema.js'
import { SourceMapper } from './collector/SourceMapper.js'
import type { Verbosity } from './collector/verbosity.schema.js'
import type { CompilerState, CompilerStateOptions } from './compiler/typescript-program.js'
import { loadCompilerState } from './compiler/typescript-program.js'
import type { ApiReportVariant, NewlineKind } from './config/config-file.schema.js'
import type { ExtractorConfig, ExtractorReportConfig } from './config/extractor-config.js'
import { DocCommentEnhancer } from './enhancers/DocCommentEnhancer.js'
import { ValidationEnhancer } from './enhancers/ValidationEnhancer.js'
import {
  ConfigSchemaValidationError,
  type ExtractorError,
  InternalInvariantError,
  isExtractorError,
} from './errors/index.js'
import type { ExtractionRequest } from './extraction-request.js'
import { DtsRollupKind } from './generators/dts-rollup-generator.js'
import { convertNewlines, renderApiReport, renderDtsRollup } from './generators/index.js'
import { MessageWriter } from './message-writer.service.js'
import { type EmitLineStep, type EnsureDirectoryStep, type WriteFileStep } from './write-plan.schema.js'

export interface RenderedRollup {
  readonly kind: DtsRollupKind
  readonly filePath: string
  readonly directoryPath: string
  readonly content: string
}

/**
 * The render artifacts decode produces and write consumes. The Sandwich hands
 * encode only the decision, so the rendered rollups travel on the snapshot.
 */
export interface RollupRenders {
  readonly record: (render: RenderedRollup) => void
  readonly all: () => readonly RenderedRollup[]
}

export const makeRollupRenders = (): RollupRenders => {
  const renders: RenderedRollup[] = []
  return {
    record: (render) => {
      renders.push(render)
    },
    all: () => renders,
  }
}

interface ReportPaths {
  readonly variant: ApiReportVariant
  readonly reportFileName: string
  readonly reportPath: string
  readonly reportTempPath: string
  readonly reportShortPath: string
  readonly reportTempShortPath: string
  readonly reportDirectory: string
  readonly reportTempDirectory: string
}

interface ReportPlan extends ReportPaths {
  readonly baseline: BaselineEvidence
  readonly folder: FolderEvidence
}

interface RollupTarget {
  readonly kind: DtsRollupKind
  readonly filePath: string
  readonly directoryPath: string
}

export interface AnalysisSnapshot {
  readonly request: ExtractionRequest
  readonly collector: Collector
  readonly view: MessageView
  readonly compilerVersion: string
  readonly reports: readonly ReportPlan[]
  readonly rollups: readonly RollupTarget[]
  readonly renderedRollups: RollupRenders
}

interface AnalysisInputs {
  readonly config: ExtractorConfig
  readonly compilerState: CompilerState
  readonly messageLog: MessageLog
  readonly reportMessages: ReportMessageSource
  readonly sourceMapper: SourceMapper
}

type WriteStep = EmitLineStep | EnsureDirectoryStep | WriteFileStep

interface WritePlan {
  readonly decision: ExtractionDecision
  readonly steps: readonly WriteStep[]
}

const analysisRefusalOf = <C>(cause: C): ExtractorError => {
  if (isExtractorError(cause)) {
    return cause
  }
  throw new InternalInvariantError({ message: 'Analysis failed', cause })
}

const decodeRefusalOf = <C>(cause: C): Result.Result<never, ExtractorError> => {
  if (isExtractorError(cause)) {
    return Result.fail(cause)
  }
  throw new InternalInvariantError({ message: 'Report rendering failed', cause })
}

const analysisOf = (inputs: AnalysisInputs): Collector => {
  const collector = new Collector({
    program: inputs.compilerState.program,
    extractorConfig: inputs.config,
    messageLog: inputs.messageLog,
    reportMessages: inputs.reportMessages,
    sourceMapper: inputs.sourceMapper,
  })
  collector.analyze()
  DocCommentEnhancer.analyze(collector)
  ValidationEnhancer.analyze(collector)
  return collector
}

const collectorOf = (inputs: AnalysisInputs): Effect.Effect<Collector, ExtractorError> =>
  Effect.try({
    try: () => analysisOf(inputs),
    catch: (cause) => analysisRefusalOf(cause),
  })

const optionalCompilerFolder = (
  folder: string | undefined,
): { readonly typescriptCompilerFolder?: string } => folder === undefined ? {} : { typescriptCompilerFolder: folder }

const compilerOptionsOf = (request: ExtractionRequest): CompilerStateOptions => ({
  projectFolder: request.config.projectFolder,
  tsconfigFilePath: request.config.tsconfigFilePath,
  mainEntryPointFilePath: request.config.mainEntryPointFilePath,
  skipLibCheck: request.config.skipLibCheck,
  ...optionalCompilerFolder(request.options.typescriptCompilerFolder),
})

const configIssueOf = (config: ExtractorConfig) => (cause: MessageRuleError): ConfigSchemaValidationError =>
  new ConfigSchemaValidationError({
    filePath: config.configFilePath,
    issues: [cause.message],
    cause: cause.cause,
  })

const messageViewOf = (
  config: ExtractorConfig,
  log: MessageLog,
): Effect.Effect<MessageView, ConfigSchemaValidationError> =>
  Effect.mapError(
    Effect.fromResult(
      makeMessageView({
        log,
        messagesConfig: config.messages,
        reportEnabled: config.apiReport.enabled,
        workingPackageFolder: config.projectFolder,
      }),
    ),
    configIssueOf(config),
  )

const projectAnchoredPath = (projectFolder: string, rawPath: string, path: Path.Path): string => {
  const withProject = rawPath.replaceAll('<projectFolder>', projectFolder)
  return path.isAbsolute(withProject) ? withProject : path.resolve(projectFolder, withProject)
}

const defaultedFolderOf = (
  projectFolder: string,
  folderPath: string | undefined,
  defaultSubfolder: string,
  path: Path.Path,
): string =>
  Option.match(Option.filter(Option.fromNullishOr(folderPath), (folder) => folder.length > 0), {
    onNone: () => path.resolve(projectFolder, defaultSubfolder),
    onSome: (folder) => projectAnchoredPath(projectFolder, folder, path),
  })

const reportPathsOf = (
  config: ExtractorConfig,
  path: Path.Path,
  reportConfig: ExtractorReportConfig,
  reportDirectory: string,
  reportTempDirectory: string,
): ReportPaths => {
  const reportPath = path.resolve(reportDirectory, reportConfig.fileName)
  const reportTempPath = path.resolve(reportTempDirectory, reportConfig.fileName)
  return {
    variant: reportConfig.variant,
    reportFileName: reportConfig.fileName,
    reportPath,
    reportTempPath,
    reportShortPath: path.relative(config.projectFolder, reportPath),
    reportTempShortPath: path.relative(config.projectFolder, reportTempPath),
    reportDirectory: path.dirname(reportPath),
    reportTempDirectory: path.dirname(reportTempPath),
  }
}

const reportPlansOf = (config: ExtractorConfig, path: Path.Path): readonly ReportPaths[] => {
  if (!config.apiReport.enabled) {
    return []
  }
  const reportDirectory = defaultedFolderOf(config.projectFolder, config.apiReport.reportFolder, 'etc', path)
  const reportTempDirectory = defaultedFolderOf(
    config.projectFolder,
    config.apiReport.reportTempFolder,
    'temp',
    path,
  )
  return config.apiReport.reportConfigs.map(
    (reportConfig) => reportPathsOf(config, path, reportConfig, reportDirectory, reportTempDirectory),
  )
}

interface DtsRollupCandidate {
  readonly rawPath: string | undefined
  readonly kind: DtsRollupKind
}

const dtsRollupCandidates = (config: ExtractorConfig): readonly DtsRollupCandidate[] => [
  { rawPath: config.dtsRollup.untrimmedFilePath, kind: DtsRollupKind.InternalRelease },
  { rawPath: config.dtsRollup.alphaTrimmedFilePath, kind: DtsRollupKind.AlphaRelease },
  { rawPath: config.dtsRollup.betaTrimmedFilePath, kind: DtsRollupKind.BetaRelease },
  { rawPath: config.dtsRollup.publicTrimmedFilePath, kind: DtsRollupKind.PublicRelease },
]

const rollupTargetOf = (
  projectFolder: string,
  path: Path.Path,
  candidate: DtsRollupCandidate,
): readonly RollupTarget[] =>
  Option.match(Option.filter(Option.fromNullishOr(candidate.rawPath), (rawPath) => rawPath.length > 0), {
    onNone: () => [],
    onSome: (rawPath) => {
      const filePath = projectAnchoredPath(projectFolder, rawPath, path)
      return [{ kind: candidate.kind, filePath, directoryPath: path.dirname(filePath) }]
    },
  })

const rollupTargetsOf = (config: ExtractorConfig, path: Path.Path): readonly RollupTarget[] =>
  config.dtsRollup.enabled
    ? dtsRollupCandidates(config).flatMap((candidate) => rollupTargetOf(config.projectFolder, path, candidate))
    : []

const baselineEvidenceOf = (
  fs: FileSystem.FileSystem,
  reportPath: string,
): Effect.Effect<BaselineEvidence, PlatformError> =>
  Effect.flatMap(fs.exists(reportPath), (exists) =>
    Match.value(exists).pipe(
      Match.when(true, () => Effect.map(fs.readFileString(reportPath), (content) => new BaselinePresent({ content }))),
      Match.when(false, () => Effect.succeed(new BaselineAbsent())),
      Match.exhaustive,
    ))

const folderEvidenceOf = (exists: boolean): FolderEvidence =>
  Match.value(exists).pipe(
    Match.when(true, () => new FolderPresent()),
    Match.when(false, () => new FolderAbsent()),
    Match.exhaustive,
  )

const reportPlanOf = (fs: FileSystem.FileSystem, paths: ReportPaths): Effect.Effect<ReportPlan, PlatformError> =>
  Effect.gen(function*() {
    const baseline = yield* baselineEvidenceOf(fs, paths.reportPath)
    const folder = yield* Effect.map(fs.exists(paths.reportDirectory), folderEvidenceOf)
    return { ...paths, baseline, folder }
  })

const readAnalysis = (
  request: ExtractionRequest,
): Effect.Effect<AnalysisSnapshot, ExtractorError | PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const config = request.config
    const sourceMapper = new SourceMapper()
    const messageLog = new MessageLog({ sourceMapper, diagnostics: request.verbosity === 'diagnostics' })
    const view = yield* messageViewOf(config, messageLog)
    const compilerState = yield* loadCompilerState(compilerOptionsOf(request))
    const collector = yield* collectorOf({
      config,
      compilerState,
      messageLog,
      reportMessages: view,
      sourceMapper,
    })
    return {
      request,
      collector,
      view,
      compilerVersion: compilerState.compiler.version,
      reports: yield* Effect.forEach(reportPlansOf(config, path), (paths) => reportPlanOf(fs, paths)),
      rollups: rollupTargetsOf(config, path),
      renderedRollups: makeRollupRenders(),
    }
  })

const renderRollupsOf = (snapshot: AnalysisSnapshot): void => {
  snapshot.rollups.forEach((target) => {
    snapshot.renderedRollups.record({
      kind: target.kind,
      filePath: target.filePath,
      directoryPath: target.directoryPath,
      content: renderDtsRollup(snapshot.collector, target.kind),
    })
  })
}

const decodeOf = (snapshot: AnalysisSnapshot): DecideExtraction => {
  renderRollupsOf(snapshot)
  const reports = snapshot.reports.map((plan) =>
    new ReportEvidence({
      variant: plan.variant,
      reportFileName: plan.reportFileName,
      reportPath: plan.reportPath,
      reportTempPath: plan.reportTempPath,
      generatedText: renderApiReport(snapshot.collector, plan.variant),
      baseline: plan.baseline,
      folder: plan.folder,
    })
  )
  return new DecideExtraction({
    localBuild: snapshot.request.options.localBuild === true,
    printApiReportDiff: snapshot.request.options.printApiReportDiff === true,
    residue: {
      errors: snapshot.view.errorCount(),
      warnings: snapshot.view.warningCount(),
    },
    reports,
  })
}

const decodeSnapshot = Sandwich.pure(
  (snapshot: AnalysisSnapshot): Result.Result<DecideExtraction, ExtractorError> => {
    try {
      return Result.succeed(decodeOf(snapshot))
    } catch (cause) {
      return decodeRefusalOf(cause)
    }
  },
)

const emitLine = (level: LogLevel, text: string): WriteStep => ({ _tag: 'EmitLine', level, text })

const ensureDirectory = (directoryPath: string): WriteStep => ({ _tag: 'EnsureDirectory', directoryPath })

const writeFile = (filePath: string, content: string): WriteStep => ({ _tag: 'WriteFile', filePath, content })

const showsDiff = (snapshot: AnalysisSnapshot): boolean =>
  snapshot.request.options.printApiReportDiff === true || admits(snapshot.request.verbosity, 'verbose')

const diffLevelOf = (printApiReportDiff: boolean): LogLevel =>
  Match.value(printApiReportDiff).pipe(
    Match.when(true, (): LogLevel => 'warning'),
    Match.when(false, (): LogLevel => 'verbose'),
    Match.exhaustive,
  )

const diffStepOf = (
  snapshot: AnalysisSnapshot,
  plan: ReportPlan,
  baselineContent: string,
  generatedText: string,
): WriteStep => {
  const patch = structuredPatch(
    plan.reportShortPath,
    plan.reportTempShortPath,
    convertToLf(baselineContent),
    generatedText,
  )
  return emitLine(
    diffLevelOf(snapshot.request.options.printApiReportDiff === true),
    `Changes to the API report:\n\n${formatPatch(patch)}`,
  )
}

const diffStepsOf = (
  snapshot: AnalysisSnapshot,
  plan: ReportPlan,
  generatedText: string,
): readonly WriteStep[] => {
  if (!showsDiff(snapshot)) {
    return []
  }
  return Match.value(plan.baseline).pipe(
    Match.tag('BaselinePresent', (baseline) => [diffStepOf(snapshot, plan, baseline.content, generatedText)]),
    Match.tag('BaselineAbsent', () => []),
    Match.exhaustive,
  )
}

const preambleSteps = (snapshot: AnalysisSnapshot): readonly WriteStep[] => [
  emitLine('info', `Analysis will use the bundled TypeScript version ${snapshot.compilerVersion}`),
]

const analysisConsoleSteps = (snapshot: AnalysisSnapshot): readonly WriteStep[] =>
  snapshot.view.consoleLines().map((line) => emitLine(line.level, line.text))

const rollupSteps = (snapshot: AnalysisSnapshot, newlineKind: NewlineKind): readonly WriteStep[] =>
  snapshot.renderedRollups.all().flatMap((render) => [
    emitLine('verbose', `Writing declaration rollup: ${render.filePath}`),
    ensureDirectory(render.directoryPath),
    writeFile(render.filePath, convertNewlines(render.content, newlineKind)),
  ])

const writingStepsOf = (
  plan: ReportPlan,
  outcome: ReportOutcome,
  newlineKind: NewlineKind,
): readonly WriteStep[] => [
  emitLine('verbose', `Generating ${plan.variant} API report: ${plan.reportPath}`),
  ensureDirectory(plan.reportTempDirectory),
  writeFile(plan.reportTempPath, convertNewlines(outcome.generatedText, newlineKind)),
]

const updateStepsOf = (
  snapshot: AnalysisSnapshot,
  plan: ReportPlan,
  generatedText: string,
): readonly WriteStep[] => [
  emitLine('warning', `You have changed the API signature for this project. Updating ${plan.reportPath}`),
  ensureDirectory(plan.reportDirectory),
  writeFile(plan.reportPath, convertNewlines(generatedText, snapshot.request.config.newlineKind)),
  ...diffStepsOf(snapshot, plan, generatedText),
]

const driftStepsOf = (
  snapshot: AnalysisSnapshot,
  plan: ReportPlan,
  generatedText: string,
): readonly WriteStep[] => [
  emitLine(
    'warning',
    `You have changed the API signature for this project. Please copy the file "${plan.reportTempShortPath}"` +
      ` to "${plan.reportShortPath}", or perform a local build (which does this automatically).` +
      ` See the Git repo documentation for more info.`,
  ),
  ...diffStepsOf(snapshot, plan, generatedText),
]

const outcomeStepsOf = (
  snapshot: AnalysisSnapshot,
  plan: ReportPlan,
  outcome: ReportOutcome,
): readonly WriteStep[] =>
  Match.value(outcome).pipe(
    Match.tag(
      'ReportUnchanged',
      () => [emitLine('verbose', `The API report is up to date: ${plan.reportTempShortPath}`)],
    ),
    Match.tag('ReportUpdated', (updated) => updateStepsOf(snapshot, plan, updated.generatedText)),
    Match.tag('ReportDriftRefused', (drifted) => driftStepsOf(snapshot, plan, drifted.generatedText)),
    Match.tag(
      'ReportMissingRefused',
      () => [
        emitLine(
          'warning',
          `The API report file is missing. Please copy the file "${plan.reportTempShortPath}"` +
            ` to "${plan.reportShortPath}", or perform a local build (which does this automatically).` +
            ` See the Git repo documentation for more info.`,
        ),
      ],
    ),
    Match.tag('ReportCreated', (created) => [
      writeFile(plan.reportPath, convertNewlines(created.generatedText, snapshot.request.config.newlineKind)),
      emitLine(
        'warning',
        `The API report file was missing, so a new file was created. Please add this file to Git:\n${plan.reportPath}`,
      ),
    ]),
    Match.tag(
      'ReportFolderMissing',
      () => [
        emitLine(
          'error',
          `Unable to create the API report file. Please make sure the target folder exists:\n${plan.reportDirectory}`,
        ),
      ],
    ),
    Match.exhaustive,
  )

const residueSteps = (snapshot: AnalysisSnapshot): readonly WriteStep[] =>
  snapshot.view.residue().map((line) => emitLine(line.level, line.text))

const footerSteps = (decision: ExtractionDecision): readonly WriteStep[] =>
  Match.value(decision).pipe(
    Match.tag('ExtractionPassed', () => [emitLine('info', 'API Extractor completed successfully')]),
    Match.tag('ExtractionFailed', () => []),
    Match.exhaustive,
  )

const reportStepsOf = (
  snapshot: AnalysisSnapshot,
  outcomes: readonly ReportOutcome[],
): readonly WriteStep[] =>
  Arr.zip(snapshot.reports, outcomes).flatMap(([plan, outcome]) => [
    ...writingStepsOf(plan, outcome, snapshot.request.config.newlineKind),
    ...outcomeStepsOf(snapshot, plan, outcome),
  ])

const isAdmittedStep = (verbosity: Verbosity) => (step: WriteStep): boolean =>
  Match.value(step).pipe(
    Match.tag('EmitLine', ({ level }) => admits(verbosity, level)),
    Match.tag('EnsureDirectory', () => true),
    Match.tag('WriteFile', () => true),
    Match.exhaustive,
  )

const writePlanOf = (snapshot: AnalysisSnapshot, decision: ExtractionDecision): WritePlan => ({
  decision,
  steps: [
    ...preambleSteps(snapshot),
    ...analysisConsoleSteps(snapshot),
    ...rollupSteps(snapshot, snapshot.request.config.newlineKind),
    ...reportStepsOf(snapshot, decision.outcomes),
    ...residueSteps(snapshot),
    ...footerSteps(decision),
  ].filter(isAdmittedStep(snapshot.request.verbosity)),
})

const executeStep = (
  fs: FileSystem.FileSystem,
  writer: MessageWriter,
  step: WriteStep,
): Effect.Effect<void, PlatformError> =>
  Match.value(step).pipe(
    Match.tag('EmitLine', ({ level, text }) => writer.write(level, formatConsoleLine(level, text))),
    Match.tag('EnsureDirectory', ({ directoryPath }) => fs.makeDirectory(directoryPath, { recursive: true })),
    Match.tag('WriteFile', ({ filePath, content }) => fs.writeFileString(filePath, content)),
    Match.exhaustive,
  )

const writeOutcome = (
  outcome: Result.Result<ExtractionDecision, never>,
  snapshot: AnalysisSnapshot,
): Effect.Effect<ExtractionDecision, PlatformError, FileSystem.FileSystem | MessageWriter> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const writer = yield* MessageWriter
    const decision = Result.merge(outcome)
    yield* Effect.forEach(writePlanOf(snapshot, decision).steps, (step) => executeStep(fs, writer, step), {
      concurrency: 1,
      discard: true,
    })
    return decision
  })

export const extractApi = Sandwich.named('api_extractor.extract_api')(readAnalysis)
  .decode(decodeSnapshot)
  .decide(chooseExtraction)
  .encode(Sandwich.pure(Result.succeed))
  .write(writeOutcome)
