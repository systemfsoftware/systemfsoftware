import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as HashMap from 'effect/HashMap'
import * as HashSet from 'effect/HashSet'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { collectAnalysis } from './analyzer/collect/collect-analysis.js'
import { enhanceDocComments } from './analyzer/collect/doc-comment-enhancement.js'
import { validateAnalysis } from './analyzer/collect/validation.js'
import { analyzeGraph } from './analyzer/graph/analyze-graph.js'
import { type INodePackageJson, PackageIndex } from './analyzer/graph/package-index.js'
import { resolveTsdocMetadataPath } from './analyzer/graph/package-metadata.js'
import type { WorkingPackage } from './analyzer/graph/working-package.js'
import { dirname, resolve } from './analyzer/path-helpers.js'
import {
  type BaselineEvidence,
  chooseExtraction,
  DecideExtraction,
  ExtractionDecision,
  ExtractionFailed,
  ExtractionPassed,
  type FolderEvidence,
  ReportEvidence,
} from './choose-extraction.workflow.js'
import * as Snapshot from './collector/analysis-snapshot.js'
import { MessageLog } from './collector/message-log.js'
import { admits, makeMessageView, type MessageView } from './collector/message-router.js'
import { type SourceMapIndex, sourcePathsOf } from './collector/SourceMapper.js'
import type { Verbosity } from './collector/verbosity.schema.js'
import { TypeScriptCompiler } from './compiler/typescript-compiler.service.js'
import type { CompilerState } from './compiler/typescript-program.js'
import { loadCompilerState } from './compiler/typescript-program.js'
import { reportEnabledOf } from './config/extractor-config.js'
import type { ExtractorConfig } from './config/extractor-config.js'
import { ancestorsNearestFirst, PACKAGE_FILE_NAME, readOptionalText } from './config/folder-walk.js'
import { newerProjectTypeScriptVersion } from './config/project-typescript.js'
import {
  apiReportCreatedText,
  apiReportDriftText,
  apiReportFolderMissingText,
  apiReportMissingText,
  apiReportUnchangedText,
  apiReportUpdatedText,
  bundledTypeScriptText,
  compilerVersionNoticeText,
  completedSuccessfullyText,
  generatingApiReportText,
  writingDtsRollupText,
} from './console-text.js'
import { ConfigSchemaValidationError } from './errors/config.schema.js'
import type { ExtractorError } from './errors/extractor-error.schema.js'
import { InternalInvariantError } from './errors/internal-invariant.schema.js'
import {
  compilerOptionsOf,
  type ReportPaths,
  reportPathsOf,
  type RollupTarget,
  rollupTargetsOf,
} from './extraction-paths.js'
import type { ExtractionRequest } from './extraction-request.js'
import {
  baselineEvidenceOf,
  bundledPackageNamesOf,
  decodedPackageJsonTextOf,
  folderEvidenceOf,
  messagePathsOf,
  type PackageEntry,
  packageIndexOf,
  preWalkerLogOf,
  renderFailureErrorOf,
  succeededOf,
  tsdocMetadataTargetOf,
  workingPackageDefectMessageOf,
  workingPackageOf,
} from './extraction-snapshot.js'
import { fileSystemFailureMessageOf } from './filesystem-error-text.js'
import { generateReviewFileContent, type RenderedApiReport } from './generators/api-report-generator.js'
import type { RenderFailure } from './generators/dts-emit-helpers.js'
import { generateTypingsFileContent } from './generators/dts-rollup-generator.js'
import { MessageWriter } from './message-writer.service.js'
import { AedocDefinitions } from './model/index.js'
import { writePlanCell } from './write-plan.cell.js'
import type { RenderedRollupText } from './write-plan.schema.js'
import { WritePlanCommand } from './write-plan.workflow.js'
import type { PlannedReport } from './write-plan.workflow.js'

type WritePlanCommandEncoded = (typeof WritePlanCommand)['Encoded']

interface ReportPlan extends ReportPaths {
  readonly baseline: BaselineEvidence
  readonly folder: FolderEvidence
}

interface IndexEntry {
  readonly mapText: readonly [string, string]
  readonly sourceTexts: ReadonlyArray<readonly [string, string]>
}

interface RollupRenderState {
  readonly renderedRollups: ReadonlyArray<RenderedRollupText>
  readonly analysis: Snapshot.AnalysisSnapshot
}

interface ReportRenderState {
  readonly handled: HashSet.HashSet<number>
  readonly renders: ReadonlyArray<RenderedApiReport>
  readonly analysis: Snapshot.AnalysisSnapshot
}

type ExtractionRead = (typeof DecideExtraction)['Encoded']

type ExtractionVerdict = (typeof ExtractionPassed)['Encoded'] | (typeof ExtractionFailed)['Encoded']

const messageViewOf = (config: ExtractorConfig): Effect.Effect<MessageView, ConfigSchemaValidationError> =>
  Effect.mapError(
    Effect.fromResult(
      makeMessageView({
        messagesConfig: config.messages,
        reportEnabled: reportEnabledOf(config),
        workingPackageFolder: config.projectFolder,
      }),
    ),
    (cause) =>
      new ConfigSchemaValidationError({
        filePath: config.configFilePath,
        violations: [{ instancePath: '', message: cause.message }],
      }),
  )

const sourceTextsOf = (
  fs: FileSystem.FileSystem,
  dtsPath: string,
  sources: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<readonly [string, string]>, PlatformError> =>
  Effect.map(
    Effect.forEach(sources, (source) => {
      const originalPath = resolve(dirname(dtsPath), source)
      return Effect.map(
        readOptionalText(originalPath, fs),
        (content): Option.Option<readonly [string, string]> => Option.map(content, (text) => [originalPath, text]),
      )
    }),
    (located) => Arr.filterMap(located, (pair) => Result.fromOption(pair, () => undefined)),
  )

const sourcePathsOfOptionalText = (mapText: Option.Option<string>): ReadonlyArray<string> =>
  Option.getOrElse(Option.map(mapText, sourcePathsOf), () => [])

const indexEntryOf = (
  fs: FileSystem.FileSystem,
  dtsPath: string,
): Effect.Effect<Option.Option<IndexEntry>, PlatformError> =>
  Effect.gen(function*() {
    const mapText = yield* readOptionalText(`${dtsPath}.map`, fs)
    const sourceTexts = yield* sourceTextsOf(fs, dtsPath, sourcePathsOfOptionalText(mapText))
    return Option.map(mapText, (text): IndexEntry => ({ mapText: [dtsPath, text], sourceTexts }))
  })

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

interface ManifestEvidence {
  readonly packageJsonPath: string
  readonly packageJson: INodePackageJson
}

const manifestEvidenceOf = (
  folder: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<ReadonlyArray<Option.Option<ManifestEvidence>>, PlatformError> =>
  Effect.forEach(
    ancestorsNearestFirst(folder, path),
    (ancestor) => {
      const packageJsonPath = path.join(ancestor, PACKAGE_FILE_NAME)
      return Effect.map(
        readOptionalText(packageJsonPath, fs),
        (content): Option.Option<ManifestEvidence> =>
          Option.map(
            Option.flatMap(content, decodedPackageJsonTextOf),
            (packageJson): ManifestEvidence => ({ packageJsonPath, packageJson }),
          ),
      )
    },
    { concurrency: 1 },
  )

const tsdocMetadataCandidatesOf = (candidate: Option.Option<string>): ReadonlyArray<string> => Option.toArray(candidate)

const packageEntryOf = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  folder: string,
): Effect.Effect<PackageEntry, PlatformError> =>
  Effect.gen(function*() {
    const found = Option.firstSomeOf(yield* manifestEvidenceOf(folder, fs, path))
    const tsdocCandidate = Option.map(found, (evidence) =>
      resolveTsdocMetadataPath(path.dirname(evidence.packageJsonPath), evidence.packageJson))
    const tsdocPaths = yield* Effect.forEach(
      tsdocMetadataCandidatesOf(tsdocCandidate),
      (candidate) =>
        Effect.map(fs.exists(candidate), (exists) => Option.filter(Option.some(candidate), () => exists)),
      { concurrency: 1 },
    )
    return {
      folder,
      packageJsonPath: Option.map(found, (evidence) => evidence.packageJsonPath),
      packageJson: Option.map(found, (evidence) => evidence.packageJson),
      tsdocMetadataPath: Option.flatten(Arr.head(tsdocPaths)),
    }
  })

const readPackageIndex = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  compilerState: CompilerState,
): Effect.Effect<PackageIndex, PlatformError> => {
  const sourceFileNames = Arr.map(compilerState.program.getSourceFiles(), (sourceFile) => sourceFile.fileName)
  const folders = Arr.dedupe(Arr.map(sourceFileNames, (fileName) => path.dirname(fileName)))
  return Effect.map(
    Effect.forEach(folders, (folder) => packageEntryOf(fs, path, folder), { concurrency: 1 }),
    (entries) => packageIndexOf(entries, sourceFileNames),
  )
}

const analysisOf = (
  config: ExtractorConfig,
  compilerState: CompilerState,
  workingPackage: WorkingPackage,
  packageIndex: PackageIndex,
  messageLog: MessageLog,
  reportMessages: MessageView,
): Effect.Effect<Snapshot.AnalysisSnapshot, ExtractorError> =>
  Effect.flatMap(
    analyzeGraph({
      program: compilerState.program,
      extractorConfig: config,
      tsdocConfiguration: AedocDefinitions.createTsdocConfiguration(),
      bundledPackageNames: bundledPackageNamesOf(config),
      packageIndex,
      workingPackage: Option.some(workingPackage),
      messageLog,
    }),
    (graphAnalysis) =>
      Effect.flatMap(collectAnalysis(graphAnalysis), (collected) =>
        Effect.map(Ref.get(graphAnalysis.ref), (graph) =>
          Snapshot.make(graph, validateAnalysis(enhanceDocComments(collected, graph), graph), reportMessages))),
  )

const renderFailureEffectOf = <A>(rendered: Result.Result<A, RenderFailure>): Effect.Effect<A, ExtractorError> =>
  Effect.catchTag(
    Effect.fromResult(Result.mapError(rendered, renderFailureErrorOf)),
    'InternalInvariantError',
    (defect) => Effect.die(defect),
  )

const renderRollupsOf = (
  targets: ReadonlyArray<RollupTarget>,
  analysis: Snapshot.AnalysisSnapshot,
): Effect.Effect<RollupRenderState, ExtractorError> => {
  const initial: RollupRenderState = { renderedRollups: [], analysis }
  const folded: Effect.Effect<RollupRenderState, ExtractorError> = Effect.succeed(initial)
  return Arr.reduce(targets, folded, (effect, target) =>
    Effect.flatMap(effect, (state) =>
      Effect.map(
        renderFailureEffectOf(generateTypingsFileContent(state.analysis, target.kind)),
        (render): RollupRenderState => ({
          renderedRollups: Arr.append(state.renderedRollups, {
            filePath: target.filePath,
            directoryPath: target.directoryPath,
            content: render.text,
            lineText: writingDtsRollupText(target.filePath),
          }),
          analysis: Snapshot.withMessageLog(state.analysis, render.log),
        }),
      )))
}

const renderReportsOf = (
  plans: ReadonlyArray<ReportPlan>,
  analysis: Snapshot.AnalysisSnapshot,
  sourceMapIndex: SourceMapIndex,
): Effect.Effect<ReportRenderState, ExtractorError> => {
  const initial: ReportRenderState = { handled: HashSet.empty<number>(), renders: [], analysis }
  const folded: Effect.Effect<ReportRenderState, ExtractorError> = Effect.succeed(initial)
  const rendered: Effect.Effect<ReportRenderState, ExtractorError> = Arr.reduce(
    plans,
    folded,
    (effect, plan) =>
      Effect.flatMap(effect, (state) =>
        Effect.map(
          renderFailureEffectOf(generateReviewFileContent(state.analysis, plan.variant, state.handled)),
          (render): ReportRenderState => ({
            handled: render.consumed,
            renders: Arr.append(state.renders, render),
            analysis: Snapshot.locateMessages(Snapshot.withMessageLog(state.analysis, render.log), sourceMapIndex),
          }),
        )),
  )
  return rendered
}

const reportPlanOf = (
  fs: FileSystem.FileSystem,
  paths: ReportPaths,
): Effect.Effect<ReportPlan, PlatformError> =>
  Effect.gen(function*() {
    const baselineRead = yield* Effect.result(readOptionalText(paths.reportPath, fs))
    const folderExists = yield* fs.exists(paths.reportDirectory)
    return {
      ...paths,
      baseline: baselineEvidenceOf(Result.mapError(baselineRead, fileSystemFailureMessageOf)),
      folder: folderEvidenceOf(folderExists),
    }
  })

const evidenceOf = (plan: ReportPlan, generatedText: string): ReportEvidence => ({
  _tag: 'ReportEvidence',
  variant: plan.variant,
  reportFileName: plan.reportFileName,
  reportPath: plan.reportPath,
  reportTempPath: plan.reportTempPath,
  reportShortPath: plan.reportShortPath,
  reportTempShortPath: plan.reportTempShortPath,
  reportDirectory: plan.reportDirectory,
  reportTempDirectory: plan.reportTempDirectory,
  generatedText,
  baseline: plan.baseline,
  folder: plan.folder,
})

/** A value a resolved derivation refused: the defect dies, it never reaches a typed channel. */
const internalOf = <A>(result: Result.Result<A, InternalInvariantError>): Effect.Effect<A> =>
  Effect.catchTag(Effect.fromResult(result), 'InternalInvariantError', (defect) => Effect.die(defect))

const readExtraction = (
  request: ExtractionRequest,
): Effect.Effect<
  ExtractionRead,
  ExtractorError | PlatformError,
  FileSystem.FileSystem | Path.Path | TypeScriptCompiler
> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const config = request.config
    const verbosity: Verbosity = request.verbosity
    const view = yield* messageViewOf(config)
    const compiler = yield* TypeScriptCompiler
    const compilerState = yield* loadCompilerState(compiler, compilerOptionsOf(request))
    const compilerVersionNotice = yield* newerProjectTypeScriptVersion(
      config.projectFolder,
      compilerState.compiler.version,
    )
    const workingPackage = yield* Effect.catchTag(
      Effect.fromResult(
        Result.fromOption(
          workingPackageOf(config, compilerState),
          () => new InternalInvariantError({ message: workingPackageDefectMessageOf(config, compilerState) }),
        ),
      ),
      'InternalInvariantError',
      (defect) => Effect.die(defect),
    )
    const messageLog = preWalkerLogOf(MessageLog.make({ diagnostics: verbosity === 'diagnostics' }), compilerState)
    const packageIndex = yield* readPackageIndex(fs, path, compilerState)
    const analysis = yield* analysisOf(config, compilerState, workingPackage, packageIndex, messageLog, view)
    const sourceMapIndex = yield* readSourceMapIndex(Snapshot.messageLog(analysis))
    const located = Snapshot.locateMessages(analysis, sourceMapIndex)
    const rollupTargets = yield* internalOf(rollupTargetsOf(config, path))
    const rollupState = yield* renderRollupsOf(rollupTargets, located)
    const reportPaths = yield* internalOf(reportPathsOf(config, path))
    const reports = yield* Effect.forEach(
      reportPaths,
      (paths) => reportPlanOf(fs, paths),
      { concurrency: 1 },
    )
    const reportState = yield* renderReportsOf(reports, rollupState.analysis, sourceMapIndex)
    const finalAnalysis = Snapshot.markHandled(reportState.analysis, reportState.handled)
    const log = Snapshot.messageLog(finalAnalysis)
    return {
      _tag: 'DecideExtraction',
      localBuild: request.options.localBuild === true,
      printApiReportDiff: request.options.printApiReportDiff === true,
      residue: { errors: view.errorCount(log, log.handled), warnings: view.warningCount(log, log.handled) },
      reports: Arr.map(Arr.zip(reports, reportState.renders), ([plan, render]) => evidenceOf(plan, render.text)),
      material: {
        verbosity,
        newlineKind: config.newlineKind,
        compilerVersion: compilerState.compiler.version,
        compilerVersionNotice: Option.getOrUndefined(compilerVersionNotice),
        consoleLines: view.consoleLines(log, log.handled),
        residueLines: view.residue(log, log.handled),
        rollups: rollupState.renderedRollups,
        tsdocMetadata: Option.toArray(yield* internalOf(tsdocMetadataTargetOf(config))),
      },
    }
  })

const plannedReportOf = (evidence: (typeof ReportEvidence)['Encoded']): (typeof PlannedReport)['Encoded'] => ({
  evidence,
  texts: {
    generating: generatingApiReportText(evidence.variant, evidence.reportPath),
    updated: apiReportUpdatedText(evidence.reportShortPath),
    drift: apiReportDriftText(evidence.reportTempShortPath, evidence.reportShortPath),
    missing: apiReportMissingText(evidence.reportTempShortPath, evidence.reportShortPath),
    created: apiReportCreatedText(evidence.reportPath),
    folderMissing: apiReportFolderMissingText(evidence.reportDirectory),
    unchanged: apiReportUnchangedText(evidence.reportTempShortPath),
  },
})

const planCommandOf = (read: ExtractionRead, decision: ExtractionDecision): WritePlanCommandEncoded => ({
  _tag: 'WritePlanCommand',
  ...read.material,
  printApiReportDiff: read.printApiReportDiff,
  infoAdmitted: admits(read.material.verbosity, 'info'),
  verboseAdmitted: admits(read.material.verbosity, 'verbose'),
  preambleText: bundledTypeScriptText(read.material.compilerVersion),
  noticeText: Option.getOrNull(
    Option.map(Option.fromNullishOr(read.material.compilerVersionNotice), compilerVersionNoticeText),
  ),
  footerText: completedSuccessfullyText(),
  reports: Arr.map(read.reports, plannedReportOf),
  outcomes: decision.outcomes,
  succeeded: succeededOf(decision),
})

const decisionOf = (verdict: ExtractionVerdict): Effect.Effect<ExtractionDecision> =>
  Effect.catchTag(
    Effect.fromResult(
      Result.mapError(
        Schema.decodeResult(ExtractionDecision)(verdict),
        (issue) =>
          new InternalInvariantError({
            message: 'The encoded extraction verdict did not decode',
            cause: issue,
          }),
      ),
    ),
    'InternalInvariantError',
    (defect) => Effect.die(defect),
  )

interface ExtractedDecision {
  readonly read: ExtractionRead
  readonly decision: ExtractionDecision
}

const extractedDecision = (
  verdict: ExtractionVerdict,
  read: ExtractionRead,
): Effect.Effect<ExtractedDecision> =>
  Effect.map(decisionOf(verdict), (decision): ExtractedDecision => ({ read, decision }))

const extractionCell: Cell.Cell<
  ExtractionRequest,
  ExtractedDecision,
  ExtractorError | PlatformError,
  FileSystem.FileSystem | Path.Path | TypeScriptCompiler
> = Sandwich.named('api_extractor.extract_api')(readExtraction)
  .decide(chooseExtraction)
  .write({
    ExtractionPassed: extractedDecision,
    ExtractionFailed: extractedDecision,
    CommandRejected: (rejected) =>
      Effect.die(new InternalInvariantError({ message: 'The extraction command failed to decode', cause: rejected })),
  })

export const extractApi: Cell.Cell<
  ExtractionRequest,
  ExtractionDecision,
  ExtractorError | PlatformError,
  FileSystem.FileSystem | Path.Path | TypeScriptCompiler | MessageWriter
> = Cell.andThen(extractionCell, (extracted) =>
  Cell.map(
    Cell.mapInput(writePlanCell, () => planCommandOf(extracted.read, extracted.decision)),
    (): ExtractionDecision => extracted.decision,
  ))
