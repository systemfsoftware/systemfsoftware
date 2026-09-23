import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { formatPatch, structuredPatch } from 'diff'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as HashMap from 'effect/HashMap'
import * as HashSet from 'effect/HashSet'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Result from 'effect/Result'

import { dirname, resolve } from './analyzer/path-helpers.js'
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
import * as Snapshot from './collector/analysis-snapshot.js'
import { MessageLog } from './collector/message-log.js'
import {
  admits,
  formatConsoleLine,
  makeMessageView,
  type MessageView,
  type ReportMessageSource,
} from './collector/message-router.js'
import { type LogLevel, MessageRuleError } from './collector/message-router.schema.js'
import { type SourceMapIndex, sourcePathsOf } from './collector/SourceMapper.js'
import type { Verbosity } from './collector/verbosity.schema.js'
import { TypeScriptCompiler } from './compiler/typescript-compiler.service.js'
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
import type { RenderedApiReport, RenderFailure } from './generators/index.js'
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

export interface ExtractionSnapshot {
  readonly request: ExtractionRequest
  readonly analysis: Snapshot.AnalysisSnapshot
  readonly view: MessageView
  readonly compilerVersion: string
  readonly reports: readonly ReportPlan[]
  readonly rollups: readonly RollupTarget[]
  readonly renderedRollups: RollupRenders
  readonly sourceMapIndex: SourceMapIndex
}

interface AnalysisInputs {
  readonly config: ExtractorConfig
  readonly compilerState: CompilerState
  readonly messageLog: MessageLog
  readonly reportMessages: ReportMessageSource
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

const analysisOf = (inputs: AnalysisInputs): Snapshot.AnalysisSnapshot => {
  const snapshot = Snapshot.make({
    program: inputs.compilerState.program,
    extractorConfig: inputs.config,
    messageLog: inputs.messageLog,
    reportMessages: inputs.reportMessages,
  })
  Snapshot.analyze(snapshot)
  DocCommentEnhancer.analyze(snapshot)
  ValidationEnhancer.analyze(snapshot)
  return snapshot
}

const collectorOf = (inputs: AnalysisInputs): Effect.Effect<Snapshot.AnalysisSnapshot, ExtractorError> =>
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

const messageViewOf = (config: ExtractorConfig): Effect.Effect<MessageView, ConfigSchemaValidationError> =>
  Effect.mapError(
    Effect.fromResult(
      makeMessageView({
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

const messagePathsOf = (log: MessageLog): readonly string[] =>
  Arr.filterMap(MessageLog.candidates(log), (candidate) =>
    Match.value(candidate.message.category).pipe(
      Match.when('Compiler', () => Result.failVoid),
      Match.orElse(() => Result.fromOption(Option.fromNullishOr(candidate.message.sourceFilePath), () => undefined)),
    ))

const optionalTextOf = (
  fs: FileSystem.FileSystem,
  filePath: string,
): Effect.Effect<Option.Option<string>, PlatformError> =>
  Effect.flatMap(fs.exists(filePath), (present) =>
    Match.value(present).pipe(
      Match.when(true, () => Effect.asSome(fs.readFileString(filePath))),
      Match.when(false, () => Effect.succeedNone),
      Match.exhaustive,
    ))

interface IndexEntry {
  readonly mapText: readonly [string, string]
  readonly sourceTexts: ReadonlyArray<readonly [string, string]>
}

const originalTextsOf = (
  fs: FileSystem.FileSystem,
  dtsPath: string,
  mapText: string,
): Effect.Effect<ReadonlyArray<readonly [string, string]>, PlatformError> =>
  Effect.map(
    Effect.forEach(sourcePathsOf(mapText), (source) => {
      const originalPath = resolve(dirname(dtsPath), source)
      return Effect.map(optionalTextOf(fs, originalPath), (content): Option.Option<readonly [string, string]> =>
        Option.map(content, (text) => [originalPath, text]))
    }),
    (located) =>
      Arr.filterMap(located, (pair) => Result.fromOption(pair, () => undefined)),
  )

const indexEntryOf = (
  fs: FileSystem.FileSystem,
  dtsPath: string,
): Effect.Effect<Option.Option<IndexEntry>, PlatformError> =>
  Effect.flatMap(optionalTextOf(fs, `${dtsPath}.map`), (mapText) =>
    Option.match(mapText, {
      onNone: () => Effect.succeedNone,
      onSome: (text) =>
        Effect.map(originalTextsOf(fs, dtsPath, text), (sourceTexts): Option.Option<IndexEntry> =>
          Option.some({ mapText: [dtsPath, text], sourceTexts })),
    }))

const readSourceMapIndex = (
  log: MessageLog,
): Effect.Effect<SourceMapIndex, PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const entries = yield* Effect.forEach(
      Arr.dedupe(messagePathsOf(log)),
      (dtsPath) => indexEntryOf(fs, dtsPath),
      { concurrency: 'unbounded' },
    )
    const present = Arr.filterMap(entries, (entry) => Result.fromOption(entry, () => undefined))
    return {
      mapTextByDtsPath: HashMap.fromIterable(Arr.map(present, (entry) => entry.mapText)),
      originalTextByPath: HashMap.fromIterable(Arr.flatMap(present, (entry) => entry.sourceTexts)),
    }
  })

const readAnalysis = (
  request: ExtractionRequest,
): Effect.Effect<
  ExtractionSnapshot,
  ExtractorError | PlatformError,
  FileSystem.FileSystem | Path.Path | TypeScriptCompiler
> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const config = request.config
    const messageLog = MessageLog.make({ diagnostics: request.verbosity === 'diagnostics' })
    const view = yield* messageViewOf(config)
    const compiler = yield* TypeScriptCompiler
    const compilerState = yield* loadCompilerState(compiler, compilerOptionsOf(request))
    const analysis = yield* collectorOf({
      config,
      compilerState,
      messageLog,
      reportMessages: view,
    })
    const sourceMapIndex = yield* readSourceMapIndex(Snapshot.messageLog(analysis))
    Snapshot.locateMessages(analysis, sourceMapIndex)
    return {
      request,
      analysis,
      view,
      compilerVersion: compilerState.compiler.version,
      reports: yield* Effect.forEach(reportPlansOf(config, path), (paths) => reportPlanOf(fs, paths)),
      rollups: rollupTargetsOf(config, path),
      renderedRollups: makeRollupRenders(),
      sourceMapIndex,
    }
  })

const renderRollupsOf = (snapshot: ExtractionSnapshot): Result.Result<void, ExtractorError> => {
  const initial: Result.Result<void, ExtractorError> = Result.succeed(undefined)
  return Arr.reduce(snapshot.rollups, initial, (accumulator, target) =>
    Result.flatMap(accumulator, () =>
      Result.map(
        Result.mapError(renderDtsRollup(snapshot.analysis, target.kind), reportRefusalOf),
        (render) => {
          snapshot.renderedRollups.record({
            kind: target.kind,
            filePath: target.filePath,
            directoryPath: target.directoryPath,
            content: render.text,
          })
        },
      )))
}

interface ReportFold {
  readonly handled: HashSet.HashSet<number>
  readonly renders: ReadonlyArray<RenderedApiReport>
}

const initialFold: ReportFold = { handled: HashSet.empty(), renders: [] }

const reportRefusalOf = (failure: RenderFailure): ExtractorError =>
  Match.value(failure).pipe(
    Match.tag('UnsupportedStarExportError', (refusal) => refusal),
    Match.orElse((defect) => {
      throw defect
    }),
  )

const renderApiReportsOf = (snapshot: ExtractionSnapshot): Result.Result<ReportFold, ExtractorError> => {
  const initial: Result.Result<ReportFold, ExtractorError> = Result.succeed(initialFold)
  return Arr.reduce(snapshot.reports, initial, (accumulator, plan) =>
    Result.flatMap(accumulator, (fold) =>
      Result.map(
        Result.mapError(renderApiReport(snapshot.analysis, plan.variant, fold.handled), reportRefusalOf),
        (render) => {
          Snapshot.locateMessages(snapshot.analysis, snapshot.sourceMapIndex)
          return { handled: render.consumed, renders: Arr.append(fold.renders, render) }
        },
      )))
}

const decideExtractionOf = (snapshot: ExtractionSnapshot, fold: ReportFold): DecideExtraction => {
  Snapshot.markHandled(snapshot.analysis, fold.handled)
  const log = Snapshot.messageLog(snapshot.analysis)
  const reports = Arr.map(Arr.zip(snapshot.reports, fold.renders), ([plan, render]) =>
    new ReportEvidence({
      variant: plan.variant,
      reportFileName: plan.reportFileName,
      reportPath: plan.reportPath,
      reportTempPath: plan.reportTempPath,
      generatedText: render.text,
      baseline: plan.baseline,
      folder: plan.folder,
    }))
  return new DecideExtraction({
    localBuild: snapshot.request.options.localBuild === true,
    printApiReportDiff: snapshot.request.options.printApiReportDiff === true,
    residue: {
      errors: snapshot.view.errorCount(log, fold.handled),
      warnings: snapshot.view.warningCount(log, fold.handled),
    },
    reports,
  })
}

const decodeOf = (snapshot: ExtractionSnapshot): Result.Result<DecideExtraction, ExtractorError> =>
  Result.flatMap(
    renderRollupsOf(snapshot),
    () => Result.map(renderApiReportsOf(snapshot), (fold) => decideExtractionOf(snapshot, fold)),
  )

const decodeSnapshot = Sandwich.pure(
  (snapshot: ExtractionSnapshot): Result.Result<DecideExtraction, ExtractorError> => {
    try {
      return decodeOf(snapshot)
    } catch (cause) {
      return decodeRefusalOf(cause)
    }
  },
)

const emitLine = (level: LogLevel, text: string): WriteStep => ({ _tag: 'EmitLine', level, text })

const ensureDirectory = (directoryPath: string): WriteStep => ({ _tag: 'EnsureDirectory', directoryPath })

const writeFile = (filePath: string, content: string): WriteStep => ({ _tag: 'WriteFile', filePath, content })

const showsDiff = (snapshot: ExtractionSnapshot): boolean =>
  snapshot.request.options.printApiReportDiff === true || admits(snapshot.request.verbosity, 'verbose')

const diffLevelOf = (printApiReportDiff: boolean): LogLevel =>
  Match.value(printApiReportDiff).pipe(
    Match.when(true, (): LogLevel => 'warning'),
    Match.when(false, (): LogLevel => 'verbose'),
    Match.exhaustive,
  )

const diffStepOf = (
  snapshot: ExtractionSnapshot,
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
  snapshot: ExtractionSnapshot,
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

const preambleSteps = (snapshot: ExtractionSnapshot): readonly WriteStep[] => [
  emitLine('info', `Analysis will use the bundled TypeScript version ${snapshot.compilerVersion}`),
]

const analysisConsoleSteps = (snapshot: ExtractionSnapshot): readonly WriteStep[] => {
  const log = Snapshot.messageLog(snapshot.analysis)
  return Arr.map(
    snapshot.view.consoleLines(log, log.handled),
    (line) => emitLine(line.level, line.text),
  )
}

const rollupSteps = (snapshot: ExtractionSnapshot, newlineKind: NewlineKind): readonly WriteStep[] =>
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
  snapshot: ExtractionSnapshot,
  plan: ReportPlan,
  generatedText: string,
): readonly WriteStep[] => [
  emitLine('warning', `You have changed the API signature for this project. Updating ${plan.reportPath}`),
  ensureDirectory(plan.reportDirectory),
  writeFile(plan.reportPath, convertNewlines(generatedText, snapshot.request.config.newlineKind)),
  ...diffStepsOf(snapshot, plan, generatedText),
]

const driftStepsOf = (
  snapshot: ExtractionSnapshot,
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
  snapshot: ExtractionSnapshot,
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

const residueSteps = (snapshot: ExtractionSnapshot): readonly WriteStep[] => {
  const log = Snapshot.messageLog(snapshot.analysis)
  return Arr.map(
    snapshot.view.residue(log, log.handled),
    (line) => emitLine(line.level, line.text),
  )
}

const footerSteps = (decision: ExtractionDecision): readonly WriteStep[] =>
  Match.value(decision).pipe(
    Match.tag('ExtractionPassed', () => [emitLine('info', 'API Extractor completed successfully')]),
    Match.tag('ExtractionFailed', () => []),
    Match.exhaustive,
  )

const reportStepsOf = (
  snapshot: ExtractionSnapshot,
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

const writePlanOf = (snapshot: ExtractionSnapshot, decision: ExtractionDecision): WritePlan => ({
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
  snapshot: ExtractionSnapshot,
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
