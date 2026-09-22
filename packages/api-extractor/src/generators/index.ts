import { formatPatch, structuredPatch } from 'diff'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'

import { convertToLf } from '../analyzer/text.js'
import type { Collector } from '../collector/Collector.js'
import { ConsoleMessageId, type MessageRouter } from '../collector/message-router.js'
import type { NewlineKind } from '../config/config-file.schema.js'
import type { ExtractorConfig, ExtractorReportConfig } from '../config/extractor-config.js'
import type { UnsupportedSyntaxError } from '../errors/index.js'
import { ApiReportGenerator } from './api-report-generator.js'
import { DtsRollupGenerator, DtsRollupKind } from './dts-rollup-generator.js'

export * from './api-report-generator.js'
export * from './dts-emit-helpers.js'
export * from './dts-rollup-generator.js'
export * from './namespace-aliaser.js'

export interface RunGeneratorsOptions {
  readonly localBuild?: boolean | undefined
  readonly printApiReportDiff?: boolean | undefined
}

export interface GeneratorsResult {
  readonly apiReportChanged: boolean
  readonly apiReportFilePaths: readonly string[]
  readonly dtsRollupFilePaths: readonly string[]
}

export const convertNewlines = (text: string, newlineKind: NewlineKind): string => {
  const lfText = convertToLf(text)
  if (newlineKind === 'crlf') {
    return lfText.replaceAll('\n', '\r\n')
  }
  return lfText
}

const resolveReportFolder = (
  folderPath: string | undefined,
  defaultSubfolder: string,
  projectFolder: string,
  path: Path.Path,
): string => {
  if (folderPath === undefined || folderPath.length === 0) {
    return path.resolve(projectFolder, defaultSubfolder)
  }
  const withProject = folderPath.replaceAll('<projectFolder>', projectFolder)
  return path.isAbsolute(withProject) ? withProject : path.resolve(projectFolder, withProject)
}

interface WriteReportContext {
  readonly collector: Collector
  readonly config: ExtractorConfig
  readonly router: MessageRouter
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
  readonly reportDirectoryPath: string
  readonly reportTempDirectoryPath: string
  readonly localBuild: boolean
  readonly printApiReportDiff: boolean
}

const handleExistingReportDiff = (
  ctx: WriteReportContext,
  expectedPath: string,
  actualPath: string,
  expectedContent: string,
  actualContent: string,
  actualContentConverted: string,
): Effect.Effect<void, PlatformError> =>
  Effect.gen(function*() {
    const expectedShort = ctx.path.relative(ctx.config.projectFolder, expectedPath)
    const actualShort = ctx.path.relative(ctx.config.projectFolder, actualPath)

    if (!ctx.localBuild) {
      yield* ctx.router.logWarning(
        ConsoleMessageId.ApiReportNotCopied,
        `You have changed the API signature for this project. Please copy the file "${actualShort}" to "${expectedShort}", or perform a local build (which does this automatically). See the Git repo documentation for more info.`,
      )
    } else {
      yield* ctx.router.logWarning(
        ConsoleMessageId.ApiReportCopied,
        `You have changed the API signature for this project. Updating ${expectedPath}`,
      )
      yield* ctx.fs.makeDirectory(ctx.path.dirname(expectedPath), { recursive: true })
      yield* ctx.fs.writeFileString(expectedPath, actualContentConverted)
    }

    const showDiff = ctx.router.verbosity === 'verbose' || ctx.router.verbosity === 'diagnostics' ||
      ctx.printApiReportDiff
    if (showDiff) {
      const patch = structuredPatch(expectedShort, actualShort, expectedContent, actualContent)
      const patchText = formatPatch(patch)
      const logFn = ctx.printApiReportDiff ? ctx.router.logWarning : ctx.router.logVerbose
      yield* logFn(ConsoleMessageId.ApiReportDiff, `Changes to the API report:\n\n${patchText}`)
    }
  })

const handleMissingReport = (
  ctx: WriteReportContext,
  expectedPath: string,
  actualPath: string,
  actualContentConverted: string,
): Effect.Effect<void, PlatformError> =>
  Effect.gen(function*() {
    const expectedShort = ctx.path.relative(ctx.config.projectFolder, expectedPath)
    const actualShort = ctx.path.relative(ctx.config.projectFolder, actualPath)

    if (!ctx.localBuild) {
      yield* ctx.router.logWarning(
        ConsoleMessageId.ApiReportNotCopied,
        `The API report file is missing. Please copy the file "${actualShort}" to "${expectedShort}", or perform a local build (which does this automatically). See the Git repo documentation for more info.`,
      )
      return
    }

    const targetFolder = ctx.path.dirname(expectedPath)
    const folderExists = yield* ctx.fs.exists(targetFolder)
    if (!folderExists) {
      yield* ctx.router.logError(
        ConsoleMessageId.ApiReportFolderMissing,
        `Unable to create the API report file. Please make sure the target folder exists:\n${targetFolder}`,
      )
      return
    }

    yield* ctx.fs.writeFileString(expectedPath, actualContentConverted)
    yield* ctx.router.logWarning(
      ConsoleMessageId.ApiReportCreated,
      `The API report file was missing, so a new file was created. Please add this file to Git:\n${expectedPath}`,
    )
  })

const processSingleReport = (
  ctx: WriteReportContext,
  reportConfig: ExtractorReportConfig,
): Effect.Effect<{ readonly changed: boolean; readonly filePath: string }, PlatformError> =>
  Effect.gen(function*() {
    const actualPath = ctx.path.resolve(ctx.reportTempDirectoryPath, reportConfig.fileName)
    const expectedPath = ctx.path.resolve(ctx.reportDirectoryPath, reportConfig.fileName)

    yield* ctx.router.logVerbose(
      ConsoleMessageId.WritingApiReport,
      `Generating ${reportConfig.variant} API report: ${expectedPath}`,
    )

    const actualContent = ApiReportGenerator.generateReviewFileContent(ctx.collector, reportConfig.variant)
    const actualContentConverted = convertNewlines(actualContent, ctx.config.newlineKind)

    yield* ctx.fs.makeDirectory(ctx.path.dirname(actualPath), { recursive: true })
    yield* ctx.fs.writeFileString(actualPath, actualContentConverted)

    const expectedExists = yield* ctx.fs.exists(expectedPath)
    if (expectedExists) {
      const expectedRaw = yield* ctx.fs.readFileString(expectedPath)
      const expectedContent = convertToLf(expectedRaw)

      if (!ApiReportGenerator.areEquivalentApiFileContents(actualContent, expectedContent)) {
        yield* handleExistingReportDiff(
          ctx,
          expectedPath,
          actualPath,
          expectedContent,
          actualContent,
          actualContentConverted,
        )
        return { changed: true, filePath: expectedPath }
      }

      yield* ctx.router.logVerbose(
        ConsoleMessageId.ApiReportUnchanged,
        `The API report is up to date: ${ctx.path.relative(ctx.config.projectFolder, actualPath)}`,
      )
      return { changed: false, filePath: expectedPath }
    }

    yield* handleMissingReport(ctx, expectedPath, actualPath, actualContentConverted)
    return { changed: true, filePath: expectedPath }
  })

interface DtsRollupTarget {
  readonly filePath: string
  readonly kind: DtsRollupKind
}

const resolveDtsTargetFilePath = (rawPath: string, projectFolder: string, path: Path.Path): string => {
  const withProject = rawPath.replaceAll('<projectFolder>', projectFolder)
  return path.isAbsolute(withProject) ? withProject : path.resolve(projectFolder, withProject)
}

const collectDtsRollupTargets = (
  config: ExtractorConfig,
  path: Path.Path,
): readonly DtsRollupTarget[] => {
  if (!config.dtsRollup.enabled) {
    return []
  }
  const targets: DtsRollupTarget[] = []
  const { untrimmedFilePath, alphaTrimmedFilePath, betaTrimmedFilePath, publicTrimmedFilePath } = config.dtsRollup
  if (untrimmedFilePath !== undefined && untrimmedFilePath.length > 0) {
    targets.push({
      filePath: resolveDtsTargetFilePath(untrimmedFilePath, config.projectFolder, path),
      kind: DtsRollupKind.InternalRelease,
    })
  }
  if (alphaTrimmedFilePath !== undefined && alphaTrimmedFilePath.length > 0) {
    targets.push({
      filePath: resolveDtsTargetFilePath(alphaTrimmedFilePath, config.projectFolder, path),
      kind: DtsRollupKind.AlphaRelease,
    })
  }
  if (betaTrimmedFilePath !== undefined && betaTrimmedFilePath.length > 0) {
    targets.push({
      filePath: resolveDtsTargetFilePath(betaTrimmedFilePath, config.projectFolder, path),
      kind: DtsRollupKind.BetaRelease,
    })
  }
  if (publicTrimmedFilePath !== undefined && publicTrimmedFilePath.length > 0) {
    targets.push({
      filePath: resolveDtsTargetFilePath(publicTrimmedFilePath, config.projectFolder, path),
      kind: DtsRollupKind.PublicRelease,
    })
  }
  return targets
}
const writeDtsRollupFile = (
  collector: Collector,
  config: ExtractorConfig,
  router: MessageRouter,
  target: DtsRollupTarget,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<string, PlatformError> =>
  Effect.gen(function*() {
    yield* router.logVerbose(
      ConsoleMessageId.WritingDtsRollup,
      `Writing declaration rollup: ${target.filePath}`,
    )
    const content = DtsRollupGenerator.generateTypingsFileContent(collector, target.kind)
    const converted = convertNewlines(content, config.newlineKind)
    yield* fs.makeDirectory(path.dirname(target.filePath), { recursive: true })
    yield* fs.writeFileString(target.filePath, converted)
    return target.filePath
  })

export const runGenerators = (
  collector: Collector,
  config: ExtractorConfig,
  router: MessageRouter,
  options?: RunGeneratorsOptions,
): Effect.Effect<GeneratorsResult, UnsupportedSyntaxError | PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    const dtsFilePaths: string[] = []
    for (const target of collectDtsRollupTargets(config, path)) {
      const written = yield* writeDtsRollupFile(collector, config, router, target, fs, path)
      dtsFilePaths.push(written)
    }

    if (!config.apiReport.enabled) {
      return {
        apiReportChanged: false,
        apiReportFilePaths: [],
        dtsRollupFilePaths: dtsFilePaths,
      }
    }

    const reportDirectoryPath = resolveReportFolder(config.apiReport.reportFolder, 'etc', config.projectFolder, path)
    const reportTempDirectoryPath = resolveReportFolder(
      config.apiReport.reportTempFolder,
      'temp',
      config.projectFolder,
      path,
    )

    const ctx: WriteReportContext = {
      collector,
      config,
      router,
      fs,
      path,
      reportDirectoryPath,
      reportTempDirectoryPath,
      localBuild: options?.localBuild === true,
      printApiReportDiff: options?.printApiReportDiff === true,
    }

    let anyChanged = false
    const filePaths: string[] = []

    for (const reportConfig of config.apiReport.reportConfigs) {
      const result = yield* processSingleReport(ctx, reportConfig)
      if (result.changed) {
        anyChanged = true
      }
      filePaths.push(result.filePath)
    }

    return {
      apiReportChanged: anyChanged,
      apiReportFilePaths: filePaths,
      dtsRollupFilePaths: dtsFilePaths,
    }
  })

export const generateApiReport = (
  collector: Collector,
  config: ExtractorConfig,
  router: MessageRouter,
  options?: RunGeneratorsOptions,
): Effect.Effect<GeneratorsResult, UnsupportedSyntaxError | PlatformError, FileSystem.FileSystem | Path.Path> =>
  runGenerators(collector, config, router, options)
