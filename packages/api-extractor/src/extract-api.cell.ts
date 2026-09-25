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
import type { Json } from 'effect/Schema'
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
import { formatConsoleLine, makeMessageView, type MessageView } from './collector/message-router.js'
import { type SourceMapIndex, sourcePathsOf } from './collector/SourceMapper.js'
import type { Verbosity } from './collector/verbosity.schema.js'
import { TypeScriptCompiler } from './compiler/typescript-compiler.service.js'
import type { CompilerState, CompilerStateOptions } from './compiler/typescript-program.js'
import { loadCompilerState } from './compiler/typescript-program.js'
import type { ApiReportVariant } from './config/config-file.schema.js'
import type { ExtractorConfig, ExtractorReportConfig } from './config/extractor-config.js'
import { filePresent, PACKAGE_FILE_NAME, searchUpwards } from './config/folder-walk.js'
import { ConfigSchemaValidationError } from './errors/config.schema.js'
import type { ExtractorError } from './errors/extractor-error.schema.js'
import { InternalInvariantError } from './errors/internal-invariant.schema.js'
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
import { buildWritePlan, type WritePlanInput } from './extraction-write-plan.js'
import { generateReviewFileContent, type RenderedApiReport } from './generators/api-report-generator.js'
import type { RenderFailure } from './generators/dts-emit-helpers.js'
import { DtsRollupKind, generateTypingsFileContent } from './generators/dts-rollup-generator.js'
import { MessageWriter } from './message-writer.service.js'
import { AedocDefinitions } from './model/index.js'
import type { EmitLineStep, EnsureDirectoryStep, RenderedRollupText, WriteFileStep } from './write-plan.schema.js'

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

const optionalFolder = (folder: string | undefined): { readonly typescriptCompilerFolder?: string } =>
  Option.getOrElse(
    Option.map(Option.fromNullishOr(folder), (found) => ({ typescriptCompilerFolder: found })),
    () => ({}),
  )

const optionalOverride = (overrideTsconfig: Json | undefined): { readonly overrideTsconfig?: Json } =>
  Option.getOrElse(
    Option.map(Option.fromNullishOr(overrideTsconfig), (found) => ({ overrideTsconfig: found })),
    () => ({}),
  )

const compilerOptionsOf = (request: ExtractionRequest): CompilerStateOptions => ({
  projectFolder: request.config.projectFolder,
  tsconfigFilePath: request.config.tsconfigFilePath,
  mainEntryPointFilePath: request.config.mainEntryPointFilePath,
  skipLibCheck: request.config.skipLibCheck,
  ...optionalOverride(request.config.overrideTsconfig),
  ...optionalFolder(request.options.typescriptCompilerFolder),
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
    (cause) =>
      new ConfigSchemaValidationError({
        filePath: config.configFilePath,
        issues: [cause.message],
        cause: cause.cause,
      }),
  )

const projectAnchoredPath = (projectFolder: string, rawPath: string, path: Path.Path): string =>
  path.resolve(projectFolder, rawPath.replaceAll('<projectFolder>', projectFolder))

const defaultedFolderOf = (
  projectFolder: string,
  folderPath: string | undefined,
  defaultSubfolder: string,
  path: Path.Path,
): string =>
  projectAnchoredPath(
    projectFolder,
    Option.getOrElse(
      Option.filter(Option.fromNullishOr(folderPath), (folder) => folder.length > 0),
      () => defaultSubfolder,
    ),
    path,
  )

const reportPathsOfOne = (
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

const reportPathsOf = (config: ExtractorConfig, path: Path.Path): ReadonlyArray<ReportPaths> =>
  Option.getOrElse(
    Option.map(
      Option.filter(Option.some(config.apiReport), (report) => report.enabled),
      (report) => {
        const reportDirectory = defaultedFolderOf(config.projectFolder, report.reportFolder, 'etc', path)
        const reportTempDirectory = defaultedFolderOf(config.projectFolder, report.reportTempFolder, 'temp', path)
        return Arr.map(
          report.reportConfigs,
          (reportConfig) => reportPathsOfOne(config, path, reportConfig, reportDirectory, reportTempDirectory),
        )
      },
    ),
    () => [],
  )

const dtsRollupCandidates = (
  config: ExtractorConfig,
): ReadonlyArray<{ readonly rawPath: string | undefined; readonly kind: DtsRollupKind }> => [
  { rawPath: config.dtsRollup.untrimmedFilePath, kind: DtsRollupKind.InternalRelease },
  { rawPath: config.dtsRollup.alphaTrimmedFilePath, kind: DtsRollupKind.AlphaRelease },
  { rawPath: config.dtsRollup.betaTrimmedFilePath, kind: DtsRollupKind.BetaRelease },
  { rawPath: config.dtsRollup.publicTrimmedFilePath, kind: DtsRollupKind.PublicRelease },
]

const rollupTargetOf = (
  projectFolder: string,
  path: Path.Path,
  candidate: { readonly rawPath: string | undefined; readonly kind: DtsRollupKind },
): ReadonlyArray<RollupTarget> =>
  Option.getOrElse(
    Option.map(
      Option.filter(Option.fromNullishOr(candidate.rawPath), (rawPath) => rawPath.length > 0),
      (rawPath) => {
        const filePath = projectAnchoredPath(projectFolder, rawPath, path)
        return [{ kind: candidate.kind, filePath, directoryPath: path.dirname(filePath) }]
      },
    ),
    () => [],
  )

const rollupTargetsOf = (config: ExtractorConfig, path: Path.Path): ReadonlyArray<RollupTarget> =>
  Option.getOrElse(
    Option.map(
      Option.filter(Option.some(config.dtsRollup), (rollup) => rollup.enabled),
      () =>
        Arr.flatMap(
          dtsRollupCandidates(config),
          (candidate) => rollupTargetOf(config.projectFolder, path, candidate),
        ),
    ),
    () => [],
  )

const optionalTextOf = (
  fs: FileSystem.FileSystem,
  filePath: string,
): Effect.Effect<Option.Option<string>, PlatformError> =>
  Effect.orElseSucceed(Effect.asSome(fs.readFileString(filePath)), () => Option.none<string>())

const sourceTextsOf = (
  fs: FileSystem.FileSystem,
  dtsPath: string,
  mapText: string,
): Effect.Effect<ReadonlyArray<readonly [string, string]>, PlatformError> =>
  Effect.map(
    Effect.forEach(sourcePathsOf(mapText), (source) => {
      const originalPath = resolve(dirname(dtsPath), source)
      return Effect.map(
        optionalTextOf(fs, originalPath),
        (content): Option.Option<readonly [string, string]> => Option.map(content, (text) => [originalPath, text]),
      )
    }),
    (located) => Arr.filterMap(located, (pair) => Result.fromOption(pair, () => undefined)),
  )

const indexEntryOf = (
  fs: FileSystem.FileSystem,
  dtsPath: string,
): Effect.Effect<Option.Option<IndexEntry>, PlatformError> =>
  Effect.flatMap(optionalTextOf(fs, `${dtsPath}.map`), (mapText) =>
    Option.getOrElse(
      Option.map(mapText, (text) =>
        Effect.map(
          sourceTextsOf(fs, dtsPath, text),
          (sourceTexts): Option.Option<IndexEntry> => Option.some({ mapText: [dtsPath, text], sourceTexts }),
        )),
      () => Effect.succeed(Option.none<IndexEntry>()),
    ))

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

const packageJsonOf = (
  fs: FileSystem.FileSystem,
  found: Option.Option<string>,
): Effect.Effect<Option.Option<INodePackageJson>, PlatformError> =>
  Option.getOrElse(
    Option.map(found, (packageJsonPath) =>
      Effect.map(
        optionalTextOf(fs, packageJsonPath),
        (content) => Option.flatMap(content, (text) => decodedPackageJsonTextOf(text)),
      )),
    () => Effect.succeed(Option.none<INodePackageJson>()),
  )

const packageEntryOf = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  folder: string,
): Effect.Effect<PackageEntry, PlatformError> =>
  Effect.gen(function*() {
    const found = yield* searchUpwards(
      folder,
      path,
      (probeFolder) => filePresent(path.join(probeFolder, PACKAGE_FILE_NAME), fs),
    )
    const packageJson = yield* packageJsonOf(fs, found)
    const tsdocCandidate = Option.flatMap(found, (packageJsonPath) =>
      Option.map(packageJson, (decoded) =>
        resolveTsdocMetadataPath(path.dirname(packageJsonPath), decoded)))
    const tsdocExists = yield* Option.getOrElse(
      Option.map(tsdocCandidate, (candidate) =>
        fs.exists(candidate)),
      () => Effect.succeed(false),
    )
    return {
      folder,
      packageJsonPath: found,
      packageJson,
      tsdocMetadataPath: Option.filter(tsdocCandidate, () => tsdocExists),
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
    const baselineText = yield* optionalTextOf(fs, paths.reportPath)
    const folderExists = yield* fs.exists(paths.reportDirectory)
    return { ...paths, baseline: baselineEvidenceOf(baselineText), folder: folderEvidenceOf(folderExists) }
  })

const evidenceOf = (plan: ReportPlan, generatedText: string): ReportEvidence =>
  new ReportEvidence({
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
    const workingPackage = yield* Option.getOrElse(
      Option.map(workingPackageOf(config, compilerState), Effect.succeed),
      () => Effect.die(new InternalInvariantError({ message: workingPackageDefectMessageOf(config, compilerState) })),
    )
    const messageLog = preWalkerLogOf(MessageLog.make({ diagnostics: verbosity === 'diagnostics' }), compilerState)
    const packageIndex = yield* readPackageIndex(fs, path, compilerState)
    const analysis = yield* analysisOf(config, compilerState, workingPackage, packageIndex, messageLog, view)
    const sourceMapIndex = yield* readSourceMapIndex(Snapshot.messageLog(analysis))
    const located = Snapshot.locateMessages(analysis, sourceMapIndex)
    const rollupState = yield* renderRollupsOf(rollupTargetsOf(config, path), located)
    const reports = yield* Effect.forEach(
      reportPathsOf(config, path),
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
        consoleLines: view.consoleLines(log, log.handled),
        residueLines: view.residue(log, log.handled),
        rollups: rollupState.renderedRollups,
        tsdocMetadata: Option.toArray(tsdocMetadataTargetOf(config)),
      },
    }
  })

const initPlanInput = (read: ExtractionRead): WritePlanInput => ({
  ...read.material,
  printApiReportDiff: read.printApiReportDiff,
  reports: read.reports,
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

const writeExtraction = (
  verdict: ExtractionVerdict,
  read: ExtractionRead,
): Effect.Effect<ExtractionDecision, PlatformError, FileSystem.FileSystem | MessageWriter> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const writer = yield* MessageWriter
    const decision = yield* decisionOf(verdict)
    const plan = buildWritePlan(initPlanInput(read), decision.outcomes, succeededOf(decision))
    yield* Effect.forEach(
      plan.lines,
      (line: EmitLineStep) => writer.write(line.level, formatConsoleLine(line.level, line.text)),
      { concurrency: 1, discard: true },
    )
    yield* Effect.forEach(
      plan.directories,
      (directory: EnsureDirectoryStep) => fs.makeDirectory(directory.directoryPath, { recursive: true }),
      { concurrency: 1, discard: true },
    )
    yield* Effect.forEach(
      plan.files,
      (file: WriteFileStep) => fs.writeFileString(file.filePath, file.content),
      { concurrency: 1, discard: true },
    )
    return decision
  })

export const extractApi: Cell.Cell<
  ExtractionRequest,
  ExtractionDecision,
  ExtractorError | PlatformError,
  FileSystem.FileSystem | Path.Path | TypeScriptCompiler | MessageWriter
> = Sandwich.named('api_extractor.extract_api')(readExtraction)
  .decide(chooseExtraction)
  .write({
    ExtractionPassed: writeExtraction,
    ExtractionFailed: writeExtraction,
    CommandRejected: (rejected) =>
      Effect.die(new InternalInvariantError({ message: 'The extraction command failed to decode', cause: rejected })),
  })
