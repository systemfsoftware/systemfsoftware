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
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import { minimatch } from 'minimatch'

import { collectAnalysis } from './analyzer/collect/collect-analysis.js'
import { enhanceDocComments } from './analyzer/collect/doc-comment-enhancement.js'
import { validateAnalysis } from './analyzer/collect/validation.js'
import { analyzeGraph } from './analyzer/graph/analyze-graph.js'
import {
  decodeNodePackageJson,
  type INodePackageJson,
  PackageIndex,
  type WorkingPackageJson,
} from './analyzer/graph/package-index.js'
import { resolveTsdocMetadataPath } from './analyzer/graph/package-metadata.js'
import { makeWorkingPackage, type WorkingPackage } from './analyzer/graph/working-package.js'
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
import { ExtractorMessageId } from './collector/extractor-message-id.js'
import { MessageLog } from './collector/message-log.js'
import {
  admits,
  formatConsoleLine,
  makeMessageView,
  type MessageView,
  type ReportMessageSource,
} from './collector/message-router.js'
import { type LogLevel, MessageRuleError } from './collector/message-router.schema.js'
import { PackageName } from './collector/package-name.js'
import { type SourceMapIndex, sourcePathsOf } from './collector/SourceMapper.js'
import type { Verbosity } from './collector/verbosity.schema.js'
import { TypeScriptCompiler } from './compiler/typescript-compiler.service.js'
import type { CompilerState, CompilerStateOptions } from './compiler/typescript-program.js'
import { loadCompilerState } from './compiler/typescript-program.js'
import type { ApiReportVariant, NewlineKind } from './config/config-file.schema.js'
import type { ExtractorConfig, ExtractorReportConfig } from './config/extractor-config.js'
import { ConfigSchemaValidationError, type ExtractorError, InternalInvariantError } from './errors/index.js'
import type { ExtractionRequest } from './extraction-request.js'
import { DtsRollupKind } from './generators/dts-rollup-generator.js'
import type { RenderedApiReport, RenderFailure } from './generators/index.js'
import { convertNewlines, renderApiReport, renderDtsRollup } from './generators/index.js'
import { MessageWriter } from './message-writer.service.js'
import { AedocDefinitions } from './model/index.js'
import { type EmitLineStep, type EnsureDirectoryStep, type WriteFileStep } from './write-plan.schema.js'

export interface RenderedRollup {
  readonly kind: DtsRollupKind
  readonly filePath: string
  readonly directoryPath: string
  readonly content: string
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
  readonly renderedRollups: readonly RenderedRollup[]
  readonly reportRenders: readonly RenderedApiReport[]
  readonly sourceMapIndex: SourceMapIndex
}

interface AnalysisInputs {
  readonly config: ExtractorConfig
  readonly compilerState: CompilerState
  readonly workingPackage: WorkingPackage
  readonly packageIndex: PackageIndex
  readonly messageLog: MessageLog
  readonly reportMessages: ReportMessageSource
}

type WriteStep = EmitLineStep | EnsureDirectoryStep | WriteFileStep

interface WritePlan {
  readonly decision: ExtractionDecision
  readonly steps: readonly WriteStep[]
}

const dtsFileExtension = /\.d(\.[^./\\]+)?\.(c|m)?ts$/i

const WRONG_INPUT_FILE_TYPE_TEXT =
  'Incorrect file type; API Extractor expects to analyze compiler outputs with the .d.ts file extension. ' +
  'Troubleshooting tips: https://api-extractor.com/link/dts-error'

const workingPackageOf = (config: ExtractorConfig, compilerState: CompilerState): Effect.Effect<WorkingPackage> => {
  const entryPointSourceFile = compilerState.program.getSourceFile(config.mainEntryPointFilePath)
  return Option.match(
    Option.all([
      Option.fromNullishOr(entryPointSourceFile),
      Option.fromNullishOr(config.packageFolder),
      Option.fromNullishOr(config.packageJson),
    ]),
    {
      onSome: ([sourceFile, packageFolder, packageJson]) =>
        Effect.succeed(
          makeWorkingPackage({ entryPointSourceFile: sourceFile, packageFolder, packageJson }),
        ),
      onNone: () =>
        Effect.die(
          new InternalInvariantError({
            message: entryPointSourceFile === undefined
              ? 'Unable to load file: ' + config.mainEntryPointFilePath
              : 'Unable to find a package.json file for the project being analyzed',
          }),
        ),
    },
  )
}

const keysOf = (table: INodePackageJson['dependencies']): ReadonlyArray<string> =>
  Option.match(Option.fromNullishOr(table), {
    onNone: () => [],
    onSome: (present) => Object.keys(present),
  })

const DEPENDENCY_KEYS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const

const dependencyNamesOf = (packageJson: INodePackageJson | undefined): ReadonlyArray<string> =>
  Option.match(Option.fromNullishOr(packageJson), {
    onNone: () => [],
    onSome: (record) => Arr.flatMap(DEPENDENCY_KEYS, (key) => keysOf(record[key])),
  })

/** Resolves `bundledPackages` names and glob patterns against the working package's dependencies. */
const bundledPackageNamesOf = (config: ExtractorConfig): Iterable<string> =>
  Match.value(config.bundledPackages.length === 0).pipe(
    Match.when(true, (): ReadonlyArray<string> => []),
    Match.when(
      false,
      (): ReadonlyArray<string> =>
        Arr.flatMap(
          config.bundledPackages,
          (packageNameOrPattern) =>
            Match.value(PackageName.isValidName(packageNameOrPattern)).pipe(
              Match.when(true, (): ReadonlyArray<string> => [packageNameOrPattern]),
              Match.when(false, (): ReadonlyArray<string> =>
                Arr.filter(
                  dependencyNamesOf(config.packageJson),
                  (dependencyName) => minimatch(dependencyName, packageNameOrPattern),
                )),
              Match.exhaustive,
            ),
        ),
    ),
    Match.exhaustive,
  )

const preWalkerLogOf = (log: MessageLog, compilerState: CompilerState): MessageLog => {
  const program = compilerState.program
  const withCompilerDiagnostics = Arr.reduce(
    program.getSemanticDiagnostics(),
    log,
    (accumulated, diagnostic) => MessageLog.addCompilerDiagnostic(accumulated, diagnostic),
  )
  const withBlocks = Match.value(withCompilerDiagnostics.diagnostics).pipe(
    Match.when(true, () => {
      const withRootNames = Arr.reduce(
        Arr.fromIterable(program.getRootFileNames()),
        MessageLog.addDiagnosticHeader(withCompilerDiagnostics, 'Root filenames'),
        (accumulated, fileName) => MessageLog.addDiagnostic(accumulated, fileName),
      )
      const withRootFooter = MessageLog.addDiagnosticFooter(withRootNames)
      const withHeader = MessageLog.addDiagnosticHeader(withRootFooter, 'Files analyzed by compiler')
      const withAnalyzedFiles = Arr.reduce(
        Arr.fromIterable(program.getSourceFiles()),
        withHeader,
        (accumulated, sourceFile) => MessageLog.addDiagnostic(accumulated, sourceFile.fileName),
      )
      return MessageLog.addDiagnosticFooter(withAnalyzedFiles)
    }),
    Match.when(false, () => withCompilerDiagnostics),
    Match.exhaustive,
  )
  return Match.value(
    Arr.findFirst(program.getSourceFiles(), (sourceFile) => !dtsFileExtension.test(sourceFile.fileName)),
  ).pipe(
    Match.when(Option.isSome, (found) =>
      MessageLog.addAnalyzerIssueForPosition(
        withBlocks,
        ExtractorMessageId.WrongInputFileType,
        WRONG_INPUT_FILE_TYPE_TEXT,
        found.value,
        0,
      )),
    Match.when(Option.isNone, () => withBlocks),
    Match.exhaustive,
  )
}

interface PackageWalkState {
  readonly packageJsonPaths: HashMap.HashMap<string, Option.Option<string>>
  readonly decoded: HashMap.HashMap<string, Option.Option<INodePackageJson>>
  readonly probed: HashSet.HashSet<string>
  readonly index: PackageIndex
}

const initialPackageWalkState: PackageWalkState = {
  packageJsonPaths: HashMap.empty(),
  decoded: HashMap.empty(),
  probed: HashSet.empty(),
  index: PackageIndex.empty(),
}

const nearestPackageJsonPathOf = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  state: PackageWalkState,
  folder: string,
): Effect.Effect<readonly [Option.Option<string>, PackageWalkState], PlatformError> =>
  Option.match(HashMap.get(state.packageJsonPaths, folder), {
    onSome: (found) => Effect.succeed([found, state] as const),
    onNone: () =>
      Effect.flatMap(fs.exists(path.join(folder, 'package.json')), (exists) =>
        Match.value(exists).pipe(
          Match.when(true, () => {
            const packageJsonPath = path.join(folder, 'package.json')
            return Effect.succeed(
              [
                Option.some(packageJsonPath),
                {
                  ...state,
                  packageJsonPaths: HashMap.set(state.packageJsonPaths, folder, Option.some(packageJsonPath)),
                },
              ] as const,
            )
          }),
          Match.when(false, () => {
            const parent = dirname(folder)
            return Match.value(parent === folder || parent.length === 0).pipe(
              Match.when(true, () => Effect.succeed([Option.none<string>(), state] as const)),
              Match.when(false, () =>
                Effect.map(nearestPackageJsonPathOf(fs, path, state, parent), ([found, walked]) =>
                  [
                    found,
                    { ...walked, packageJsonPaths: HashMap.set(walked.packageJsonPaths, folder, found) },
                  ] as const)),
              Match.exhaustive,
            )
          }),
          Match.exhaustive,
        )),
  })

const workingPackageJsonFor = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  state: PackageWalkState,
  folder: string,
): Effect.Effect<readonly [Option.Option<WorkingPackageJson>, PackageWalkState], PlatformError> =>
  Effect.flatMap(
    nearestPackageJsonPathOf(fs, path, state, folder),
    ([packageJsonPath, walked]) =>
      Option.match(packageJsonPath, {
        onNone: () => Effect.succeed([Option.none(), walked] as const),
        onSome: (foundPath) =>
          Option.match(HashMap.get(walked.decoded, foundPath), {
            onSome: (decoded) =>
              Effect.succeed(
                [
                  Option.map(decoded, (packageJson) => ({ packageJsonPath: foundPath, packageJson })),
                  walked,
                ] as const,
              ),
            onNone: () =>
              Effect.map(
                Effect.orElseSucceed(fs.readFileString(foundPath), () => ''),
                (content) => {
                  const decoded: Option.Option<INodePackageJson> = Result.match(decodeNodePackageJson(content), {
                    onSuccess: Option.some,
                    onFailure: () => Option.none(),
                  })
                  return [
                    Option.map(decoded, (packageJson) => ({ packageJsonPath: foundPath, packageJson })),
                    { ...walked, decoded: HashMap.set(walked.decoded, foundPath, decoded) },
                  ] as const
                },
              ),
          }),
      }),
  )

const withTsdocProbeOf = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  state: PackageWalkState,
  workingPackage: Option.Option<WorkingPackageJson>,
): Effect.Effect<PackageWalkState, PlatformError> =>
  Option.match(workingPackage, {
    onNone: () => Effect.succeed(state),
    onSome: (found) =>
      Match.value(HashSet.has(state.probed, found.packageJsonPath)).pipe(
        Match.when(true, (): Effect.Effect<PackageWalkState, PlatformError> => Effect.succeed(state)),
        Match.when(false, (): Effect.Effect<PackageWalkState, PlatformError> => {
          const tsdocMetadataPath = resolveTsdocMetadataPath(path.dirname(found.packageJsonPath), found.packageJson)
          return Effect.map(fs.exists(tsdocMetadataPath), (exists) => ({
            ...state,
            probed: HashSet.add(state.probed, found.packageJsonPath),
            index: exists ? PackageIndex.withTsdocMetadataPath(state.index, tsdocMetadataPath) : state.index,
          }))
        }),
        Match.exhaustive,
      ),
  })

const readPackageIndex = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  compilerState: CompilerState,
): Effect.Effect<PackageIndex, PlatformError> => {
  const initial: Effect.Effect<PackageWalkState, PlatformError> = Effect.succeed(initialPackageWalkState)
  return Effect.map(
    Arr.reduce(
      compilerState.program.getSourceFiles(),
      initial,
      (effect, sourceFile) =>
        Effect.flatMap(effect, (state) =>
          Effect.flatMap(
            workingPackageJsonFor(fs, path, state, path.dirname(sourceFile.fileName)),
            ([workingPackage, walked]) =>
              Effect.map(
                withTsdocProbeOf(fs, path, walked, workingPackage),
                (probed) => ({
                  ...probed,
                  index: PackageIndex.withSourceFile(probed.index, sourceFile.fileName, workingPackage),
                }),
              ),
          )),
    ),
    (final) => final.index,
  )
}

const analysisOf = (inputs: AnalysisInputs): Effect.Effect<Snapshot.AnalysisSnapshot, ExtractorError> =>
  Effect.flatMap(
    analyzeGraph({
      program: inputs.compilerState.program,
      extractorConfig: inputs.config,
      tsdocConfiguration: AedocDefinitions.createTsdocConfiguration(),
      bundledPackageNames: bundledPackageNamesOf(inputs.config),
      packageIndex: inputs.packageIndex,
      workingPackage: Option.some(inputs.workingPackage),
      messageLog: inputs.messageLog,
    }),
    (graphAnalysis) =>
      Effect.flatMap(collectAnalysis(graphAnalysis), (collected) =>
        Effect.map(Ref.get(graphAnalysis.ref), (graph) =>
          Snapshot.make(
            graph,
            validateAnalysis(enhanceDocComments(collected, graph), graph),
            inputs.reportMessages,
          ))),
  )

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
    const view = yield* messageViewOf(config)
    const compiler = yield* TypeScriptCompiler
    const compilerState = yield* loadCompilerState(compiler, compilerOptionsOf(request))
    const workingPackage = yield* workingPackageOf(config, compilerState)
    const messageLog = preWalkerLogOf(
      MessageLog.make({ diagnostics: request.verbosity === 'diagnostics' }),
      compilerState,
    )
    const packageIndex = yield* readPackageIndex(fs, path, compilerState)
    const analysis = yield* analysisOf({
      config,
      compilerState,
      workingPackage,
      packageIndex,
      messageLog,
      reportMessages: view,
    })
    const sourceMapIndex = yield* readSourceMapIndex(Snapshot.messageLog(analysis))
    const located = Snapshot.locateMessages(analysis, sourceMapIndex)
    const rollups = rollupTargetsOf(config, path)
    const rollupState = yield* renderRollupsOf(rollups, located)
    const reports = yield* Effect.forEach(reportPlansOf(config, path), (paths) => reportPlanOf(fs, paths))
    const reportState = yield* renderReportsOf(reports, rollupState.analysis, sourceMapIndex)
    return {
      request,
      analysis: Snapshot.markHandled(reportState.analysis, reportState.handled),
      view,
      compilerVersion: compilerState.compiler.version,
      reports,
      rollups,
      renderedRollups: rollupState.renderedRollups,
      reportRenders: reportState.renders,
      sourceMapIndex,
    }
  })

const renderFailureEffectOf = <A>(rendered: Result.Result<A, RenderFailure>): Effect.Effect<A, ExtractorError> =>
  Result.match(rendered, {
    onSuccess: Effect.succeed,
    onFailure: (failure) =>
      Match.value(failure).pipe(
        Match.tag('UnsupportedStarExportError', (refusal) => Effect.fail(refusal)),
        Match.orElse((defect) => Effect.die(defect)),
      ),
  })

interface RollupRenderState {
  readonly renderedRollups: readonly RenderedRollup[]
  readonly analysis: Snapshot.AnalysisSnapshot
}

const renderRollupsOf = (
  targets: readonly RollupTarget[],
  analysis: Snapshot.AnalysisSnapshot,
): Effect.Effect<RollupRenderState, ExtractorError> => {
  const initial: Effect.Effect<RollupRenderState, ExtractorError> = Effect.succeed({ renderedRollups: [], analysis })
  return Effect.map(
    Arr.reduce(
      targets,
      initial,
      (effect, target) =>
        Effect.flatMap(effect, (state) =>
          Effect.map(
            renderFailureEffectOf(renderDtsRollup(state.analysis, target.kind)),
            (render) => ({
              renderedRollups: Arr.append(state.renderedRollups, {
                kind: target.kind,
                filePath: target.filePath,
                directoryPath: target.directoryPath,
                content: render.text,
              }),
              analysis: Snapshot.withMessageLog(state.analysis, render.log),
            }),
          )),
    ),
    (final) => final,
  )
}

interface ReportRenderState {
  readonly handled: HashSet.HashSet<number>
  readonly renders: readonly RenderedApiReport[]
  readonly analysis: Snapshot.AnalysisSnapshot
}

const renderReportsOf = (
  plans: readonly ReportPlan[],
  analysis: Snapshot.AnalysisSnapshot,
  sourceMapIndex: SourceMapIndex,
): Effect.Effect<ReportRenderState, ExtractorError> => {
  const initial: Effect.Effect<ReportRenderState, ExtractorError> = Effect.succeed({
    handled: HashSet.empty(),
    renders: [],
    analysis,
  })
  return Effect.map(
    Arr.reduce(
      plans,
      initial,
      (effect, plan) =>
        Effect.flatMap(effect, (state) =>
          Effect.map(
            renderFailureEffectOf(renderApiReport(state.analysis, plan.variant, state.handled)),
            (render) => ({
              handled: render.consumed,
              renders: Arr.append(state.renders, render),
              analysis: Snapshot.locateMessages(
                Snapshot.withMessageLog(state.analysis, render.log),
                sourceMapIndex,
              ),
            }),
          )),
    ),
    (final) => final,
  )
}

const decideExtractionOf = (snapshot: ExtractionSnapshot): DecideExtraction => {
  const log = Snapshot.messageLog(snapshot.analysis)
  const reports = Arr.map(Arr.zip(snapshot.reports, snapshot.reportRenders), ([plan, render]) =>
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
      errors: snapshot.view.errorCount(log, log.handled),
      warnings: snapshot.view.warningCount(log, log.handled),
    },
    reports,
  })
}

const decodeSnapshot = Sandwich.pure(
  (snapshot: ExtractionSnapshot): Result.Result<DecideExtraction, never> =>
    Result.succeed(decideExtractionOf(snapshot)),
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
  Arr.flatMap(snapshot.renderedRollups, (render) => [
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
