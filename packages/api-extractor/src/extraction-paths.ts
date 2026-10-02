import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import type * as Path from 'effect/Path'
import * as Result from 'effect/Result'
import type { Json } from 'effect/Schema'

import type { CompilerStateOptions } from './compiler/typescript-program.js'
import { absolutePathOf } from './config/absolute-path.js'
import { AbsolutePath } from './config/absolute-path.schema.js'
import type { ApiReportVariant } from './config/config-file.schema.js'
import type { ExtractorConfig, ExtractorReportConfig } from './config/extractor-config.js'
import type { CompilerOverride } from './config/extractor-config.schema.js'
import type { RollupTarget as RollupTargetSetting } from './config/extractor-config.schema.js'
import type { InternalInvariantError } from './errors/internal-invariant.schema.js'
import type { ExtractionRequest } from './extraction-request.js'
import { DtsRollupKind } from './generators/dts-rollup-generator.js'

const optionalOverrideOf = (override: CompilerOverride): { readonly overrideTsconfig?: Json } =>
  Match.value(override).pipe(
    Match.tag('CompilerOverrideAbsent', () => ({})),
    Match.tag('CompilerOverridePresent', (present) => ({ overrideTsconfig: present.tsconfig })),
    Match.exhaustive,
  )

const optionalFolderOf = (folder: string | undefined): { readonly typescriptCompilerFolder?: string } =>
  Option.getOrElse(
    Option.map(Option.fromNullishOr(folder), (found) => ({ typescriptCompilerFolder: found })),
    () => ({}),
  )

export const compilerOptionsOf = (request: ExtractionRequest): CompilerStateOptions => ({
  projectFolder: request.config.projectFolder,
  tsconfigFilePath: request.config.tsconfigFilePath,
  mainEntryPointFilePath: request.config.mainEntryPointFilePath,
  skipLibCheck: request.config.skipLibCheck,
  ...optionalOverrideOf(request.config.overrideTsconfig),
  ...optionalFolderOf(request.options.typescriptCompilerFolder),
})

/** One report variant's resolved paths. */
export interface ReportPaths {
  readonly variant: ApiReportVariant
  readonly reportFileName: string
  readonly reportPath: AbsolutePath
  readonly reportTempPath: AbsolutePath
  readonly reportShortPath: string
  readonly reportTempShortPath: string
  readonly reportDirectory: AbsolutePath
  readonly reportTempDirectory: AbsolutePath
}

/** One declaration-rollup target's resolved path and release kind. */
export interface RollupTarget {
  readonly kind: DtsRollupKind
  readonly filePath: AbsolutePath
  readonly directoryPath: AbsolutePath
}

const reportPathsOfOne = (
  config: ExtractorConfig,
  path: Path.Path,
  reportConfig: ExtractorReportConfig,
  reportDirectory: AbsolutePath,
  reportTempDirectory: AbsolutePath,
): Result.Result<ReportPaths, InternalInvariantError> => {
  const reportPath = path.resolve(reportDirectory, reportConfig.fileName)
  const reportTempPath = path.resolve(reportTempDirectory, reportConfig.fileName)
  return Result.map(
    Result.all([
      absolutePathOf(reportPath),
      absolutePathOf(reportTempPath),
      absolutePathOf(path.dirname(reportPath)),
      absolutePathOf(path.dirname(reportTempPath)),
    ]),
    (
      [resolvedReportPath, resolvedReportTempPath, resolvedReportDirectory, resolvedReportTempDirectory],
    ): ReportPaths => ({
      variant: reportConfig.variant,
      reportFileName: reportConfig.fileName,
      reportPath: resolvedReportPath,
      reportTempPath: resolvedReportTempPath,
      reportShortPath: path.relative(config.projectFolder, resolvedReportPath),
      reportTempShortPath: path.relative(config.projectFolder, resolvedReportTempPath),
      reportDirectory: resolvedReportDirectory,
      reportTempDirectory: resolvedReportTempDirectory,
    }),
  )
}

export const reportPathsOf = dual<
  (path: Path.Path) => (config: ExtractorConfig) => Result.Result<ReadonlyArray<ReportPaths>, InternalInvariantError>,
  (config: ExtractorConfig, path: Path.Path) => Result.Result<ReadonlyArray<ReportPaths>, InternalInvariantError>
>(2, (
  config: ExtractorConfig,
  path: Path.Path,
): Result.Result<ReadonlyArray<ReportPaths>, InternalInvariantError> =>
  Match.value(config.apiReport).pipe(
    Match.tag('ApiReportDisabled', (): Result.Result<ReadonlyArray<ReportPaths>, InternalInvariantError> =>
      Result.succeed([])),
    Match.tag('ApiReportEnabled', (report) =>
      Result.all(
        Arr.map(
          report.reportConfigs,
          (reportConfig) =>
            reportPathsOfOne(config, path, reportConfig, report.reportFolder, report.reportTempFolder),
        ),
      )),
    Match.exhaustive,
  ))

const rollupTargetOf = (
  path: Path.Path,
  target: RollupTargetSetting,
  kind: DtsRollupKind,
): Result.Result<Option.Option<RollupTarget>, InternalInvariantError> =>
  Match.value(target).pipe(
    Match.tag('RollupWritten', (written) =>
      Result.map(
        absolutePathOf(path.dirname(written.filePath)),
        (directoryPath): Option.Option<RollupTarget> =>
          Option.some({ kind, filePath: written.filePath, directoryPath }),
      )),
    Match.tag('RollupSkipped', () => Result.succeed(Option.none<RollupTarget>())),
    Match.exhaustive,
  )

export const rollupTargetsOf = dual<
  (path: Path.Path) => (config: ExtractorConfig) => Result.Result<ReadonlyArray<RollupTarget>, InternalInvariantError>,
  (config: ExtractorConfig, path: Path.Path) => Result.Result<ReadonlyArray<RollupTarget>, InternalInvariantError>
>(2, (
  config: ExtractorConfig,
  path: Path.Path,
): Result.Result<ReadonlyArray<RollupTarget>, InternalInvariantError> =>
  Match.value(config.dtsRollup).pipe(
    Match.tag('DtsRollupDisabled', (): Result.Result<ReadonlyArray<RollupTarget>, InternalInvariantError> =>
      Result.succeed([])),
    Match.tag('DtsRollupEnabled', (rollup) => {
      const candidates: ReadonlyArray<readonly [RollupTargetSetting, DtsRollupKind]> = [
        [rollup.untrimmed, DtsRollupKind.InternalRelease],
        [rollup.alpha, DtsRollupKind.AlphaRelease],
        [rollup.beta, DtsRollupKind.BetaRelease],
        [rollup.public, DtsRollupKind.PublicRelease],
      ]
      return Result.map(
        Result.all(Arr.map(candidates, ([target, kind]) =>
          rollupTargetOf(path, target, kind))),
        (targets) => Arr.getSomes(targets),
      )
    }),
    Match.exhaustive,
  ))
