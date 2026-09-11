import { type CheckResult, type PassedCheckResult } from '@systemfsoftware/stryker-js/Checker'
import type { ExitClass } from '@systemfsoftware/stryker-js/ExitClass'
import { highestExitClass, verdictExitClass } from '@systemfsoftware/stryker-js/ExitClass'
import type { MutantResult, MutantTestCoverage } from '@systemfsoftware/stryker-js/Mutant'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Options'
import type { AnyPluginContribution, PluginKind } from '@systemfsoftware/stryker-js/Plugin'
import { calculateMetrics } from '@systemfsoftware/stryker-js/Report'
import type { MetricsResult } from '@systemfsoftware/stryker-js/Report'
import type * as schema from '@systemfsoftware/stryker-js/Report'
import type { MutantRunResult } from '@systemfsoftware/stryker-js/TestRunner'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as HashMap from 'effect/HashMap'
import * as Match from 'effect/Match'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Queue from 'effect/Queue'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { RunEvents, VerdictReached } from './RunEvent.js'

import type { ReporterStage } from '../report/ReporterStream.js'
import { closeReporterStage, offerTerminalReport, terminalDrainClass } from '../report/ReporterStream.js'
import { checkStatusToMutantStatus, mapRunResult, toSchemaLocation } from './mutant-result-mapping.js'
import type { TestCoverage } from './Mutants.js'
import type { ResolvedMode } from './output-mode.js'
import type { Project } from './Project.js'
import { FILE_CONCURRENCY, readOriginal } from './Project.js'
import {
  assembleFileResults,
  assembleTestFiles,
  determineLanguage,
  reportFileName,
  testIdRemap,
} from './report-assembly.js'
import type { RunOutcome } from './Run.js'
import { strykerVersion } from './stryker-package.js'
import { buildVerdictEnvelope } from './verdict-envelope.js'

const STRYKER_FRAMEWORK: Readonly<Pick<schema.FrameworkInformation, 'branding' | 'name' | 'version'>> = Object.freeze({
  branding: {
    homepageUrl: 'https://stryker-mutator.io',
    imageUrl: 'https://stryker-mutator.io/assets/images/stryker-80x80.png',
  },
  name: 'StrykerJS',
  version: strykerVersion,
})

export interface MutationReportingService {
  readonly reportCheckFailure: (
    mutant: MutantTestCoverage,
    result: Exclude<CheckResult, PassedCheckResult>,
  ) => Effect.Effect<MutantResult>
  readonly reportMutantRunResult: (
    mutant: MutantTestCoverage,
    result: MutantRunResult,
  ) => Effect.Effect<MutantResult>
  readonly reportAll: (
    results: readonly MutantResult[],
  ) => Effect.Effect<RunOutcome, unknown, FileSystem.FileSystem | Path.Path | RunEvents>
  readonly checkpoint: (
    results: readonly MutantResult[],
  ) => Effect.Effect<void, unknown, FileSystem.FileSystem | Path.Path>
}

export class MutationReporting extends Context.Service<MutationReporting, MutationReportingService>()(
  'MutationReporting',
) {}

export interface MakeMutationReportingInput {
  readonly reporterStage: ReporterStage
  readonly options: StrykerOptions
  readonly project: Project
  readonly testCoverage: TestCoverage
  readonly runId: string
  readonly resolvedMode: ResolvedMode
  readonly pluginsByKind: HashMap.HashMap<PluginKind, readonly AnyPluginContribution[]>
  readonly sandboxDirectory: string
  readonly basePath: string
}

export const makeMutationReportingService = (input: MakeMutationReportingInput): MutationReportingService => {
  const reportMutantStatus = (
    mutant: MutantTestCoverage,
    status: MutantResult['status'],
  ): Effect.Effect<MutantResult> => {
    const location = toSchemaLocation(mutant.location)
    return Effect.succeed({
      _tag: 'Mutant',
      id: mutant.id,
      fileName: mutant.fileName,
      mutatorName: mutant.mutatorName,
      replacement: mutant.replacement,
      location,
      status,
      coveredBy: mutant.coveredBy,
      static: mutant.static,
      testsCompleted: mutant.testsCompleted,
      description: mutant.description,
      statusReason: mutant.statusReason,
    })
  }

  const reportCheckFailure: MutationReportingService['reportCheckFailure'] = (mutant, result) =>
    reportMutantStatus(mutant, checkStatusToMutantStatus(result.status))

  const reportMutantRunResult: MutationReportingService['reportMutantRunResult'] = (mutant, result) => {
    const mapped = mapRunResult(mutant, result)
    return Effect.succeed(mapped)
  }

  const uniqueNames = (
    names: readonly (string | undefined)[],
  ): readonly string[] => [...new Set(names.filter((name): name is string => name !== undefined))]

  const readMutatedSources = (fileNames: readonly string[]) =>
    Effect.gen(function*() {
      const entries = yield* Effect.forEach(
        fileNames,
        (fileName) =>
          Effect.gen(function*() {
            const language = determineLanguage(fileName)
            const file = MutableHashMap.get(input.project.files, fileName)
            if (Option.isNone(file)) {
              yield* Effect.logWarning(
                `File "${fileName}" not found in input files, but did receive mutant result for it. This shouldn't happen`,
              )
              const empty: schema.FileResult = { language, mutants: [], source: '' }
              return [fileName, empty] as const
            }
            const read: schema.FileResult = { language, mutants: [], source: yield* readOriginal(file.value) }
            return [fileName, read] as const
          }),
        { concurrency: FILE_CONCURRENCY },
      )
      return HashMap.fromIterable(entries)
    })

  const readTestSources = (fileNames: readonly string[]) =>
    Effect.gen(function*() {
      const entries = yield* Effect.forEach(
        fileNames,
        (fileName) =>
          Effect.gen(function*() {
            const file = MutableHashMap.get(input.project.files, fileName)
            if (Option.isNone(file)) {
              yield* Effect.logWarning(
                `Test file "${fileName}" not found in input files, but did receive test result for it. This shouldn't happen.`,
              )
              const empty: schema.TestFile = { tests: [] }
              return [fileName, empty] as const
            }
            const read: schema.TestFile = { tests: [], source: yield* readOriginal(file.value) }
            return [fileName, read] as const
          }),
        { concurrency: FILE_CONCURRENCY },
      )
      return HashMap.fromIterable(entries)
    })

  const assembleReport = (results: readonly MutantResult[]) =>
    Effect.gen(function*() {
      const pathService = yield* Path.Path
      const tests = [...MutableHashMap.values(input.testCoverage.testsById)]
      const remap = testIdRemap(tests.map((test) => test.id))
      const mutatedFileNames = uniqueNames(results.map((result) => result.fileName))
      const testFileNames = uniqueNames(tests.map((test) => test.fileName))
      const sources = yield* readMutatedSources(mutatedFileNames)
      const testSources = yield* readTestSources(testFileNames)
      const reportNames = HashMap.fromIterable(
        [...mutatedFileNames, ...testFileNames].map(
          (fileName) => [fileName, reportFileName(pathService.relative(input.basePath, fileName))] as const,
        ),
      )
      return {
        files: assembleFileResults({ sources, reportNames, mutants: results, remap }),
        testFiles: assembleTestFiles({ testSources, reportNames, tests, remap }),
      }
    })

  const mutationTestReport = (
    results: readonly MutantResult[],
  ): Effect.Effect<schema.MutationTestResult, unknown, FileSystem.FileSystem | Path.Path> =>
    Effect.gen(function*() {
      const { files, testFiles } = yield* assembleReport(results)
      const dependencies = yield* discoverDependencies()
      return {
        files,
        schemaVersion: '1.0',
        thresholds: input.options.thresholds,
        testFiles,
        projectRoot: input.basePath,
        config: input.options,
        framework: { ...STRYKER_FRAMEWORK, dependencies },
      }
    })

  const MANIFEST_SPECIFIERS = [
    '@systemfsoftware/stryker-js-vitest-runner',
    '@systemfsoftware/stryker-js-typescript-checker',
    '@systemfsoftware/stryker-plugins',
    'vitest',
    'karma',
    'karma-chai',
    'karma-chrome-launcher',
    'karma-jasmine',
    'karma-mocha',
    'mocha',
    'jasmine',
    'jasmine-core',
    'jest',
    'react-scripts',
    'typescript',
    '@angular/cli',
    'webpack',
    'webpack-cli',
    'ts-jest',
  ] as const

  const ManifestSchema = S.Struct({ version: S.optional(S.String) })

  const readManifestVersion = (
    fs: FileSystem.FileSystem,
    pathService: Path.Path,
    specifier: string,
  ): Effect.Effect<Option.Option<string>> =>
    Effect.gen(function*() {
      const resolved = yield* Effect.try(() => new URL(import.meta.resolve(`${specifier}/package.json`)))
      const manifestPath = yield* pathService.fromFileUrl(resolved)
      const text = yield* fs.readFileString(manifestPath)
      return Result.match(S.decodeUnknownResult(S.fromJsonString(ManifestSchema))(text), {
        onFailure: () => Option.none<string>(),
        onSuccess: (manifest) => Option.some(manifest.version ?? ''),
      })
    }).pipe(Effect.orElseSucceed(() => Option.none<string>()))

  const discoverDependencies = (): Effect.Effect<
    schema.Dependencies,
    never,
    FileSystem.FileSystem | Path.Path
  > =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const pathService = yield* Path.Path
      const pairs = yield* Effect.forEach(
        MANIFEST_SPECIFIERS,
        (specifier) =>
          Effect.map(readManifestVersion(fs, pathService, specifier), (version) => [specifier, version] as const),
        { concurrency: FILE_CONCURRENCY },
      )
      return Object.fromEntries(
        pairs.flatMap(([specifier, version]) =>
          Option.match(version, {
            onNone: (): ReadonlyArray<readonly [string, string]> => [],
            onSome: (present): ReadonlyArray<readonly [string, string]> => [[specifier, present]],
          })
        ),
      )
    })

  const determineExitCode = (
    metrics: MetricsResult,
  ): Effect.Effect<ExitClass | null> =>
    Effect.gen(function*() {
      const { mutationScore } = metrics.metrics
      const breaking = input.options.thresholds.break
      const formattedScore = mutationScore.toFixed(2)
      const verdict = verdictExitClass(mutationScore, breaking)

      if (verdict === null) {
        yield* Match.value(breaking).pipe(
          Match.when(null, () =>
            Effect.logDebug(
              "No breaking threshold configured. Won't fail the build no matter how low your mutation score is. Set `thresholds.break` to change this behavior.",
            )),
          Match.orElse((threshold) =>
            Effect.logInfo(
              `Final mutation score of ${formattedScore} is greater than or equal to break threshold ${
                String(threshold)
              }`,
            )
          ),
        )
        return null
      }

      yield* Effect.logError(
        `Final mutation score ${formattedScore} under breaking threshold ${
          String(breaking)
        }, setting exit code to 1 (failure).`,
      )
      yield* Effect.logInfo(
        '(improve mutation score or set `thresholds.break = null` to prevent this error in the future)',
      )
      return verdict
    })
  const emitVerdict = (
    report: schema.MutationTestResult,
    pathService: Path.Path,
  ): Effect.Effect<void, never, RunEvents> =>
    Effect.gen(function*() {
      const envelope = buildVerdictEnvelope(
        report,
        input.resolvedMode.mode,
        input.resolvedMode.signal,
        input.runId,
        input.basePath,
        pathService,
      )
      const queue = yield* RunEvents
      yield* Queue.offer(
        queue,
        new VerdictReached({
          schemaVersion: envelope.schemaVersion,
          runId: envelope.runId,
          mode: envelope.mode,
          signal: envelope.signal,
          score: envelope.score,
          thresholds: envelope.thresholds,
          reportFile: envelope.reportFile,
          counts: envelope.counts,
          mutants: envelope.mutants,
        }),
      )
    })

  const reportAll: MutationReportingService['reportAll'] = (results) =>
    Effect.gen(function*() {
      const pathService = yield* Path.Path
      const report = yield* mutationTestReport(results)
      const metrics = calculateMetrics(report.files)
      yield* offerTerminalReport(input.reporterStage, report, metrics)
      const terminalDrain = terminalDrainClass(yield* closeReporterStage(input.reporterStage))
      const verdict = yield* determineExitCode(metrics)
      const finalVerdict = highestExitClass(
        [verdict, terminalDrain].filter((candidate): candidate is ExitClass => candidate !== null),
      )
      yield* emitVerdict(report, pathService)
      if (input.options.incremental) {
        const fs = yield* FileSystem.FileSystem
        const dir = pathService.dirname(input.options.incrementalFile)
        yield* fs.makeDirectory(dir, { recursive: true })
        yield* fs.writeFileString(input.options.incrementalFile, JSON.stringify(report, null, 2))
      }
      return { results, verdict: finalVerdict } satisfies RunOutcome
    })
  const writeAtomic = (file: string, content: string) =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const pathService = yield* Path.Path
      yield* fs.makeDirectory(pathService.dirname(file), { recursive: true })
      const tmp = `${file}.tmp`
      yield* fs.writeFileString(tmp, content)
      yield* fs.rename(tmp, file).pipe(
        Effect.catch(() => fs.copyFile(tmp, file).pipe(Effect.andThen(fs.remove(tmp)))),
      )
    })

  const slimIncrementalReport = (results: readonly MutantResult[]) =>
    Effect.gen(function*() {
      const { files, testFiles } = yield* assembleReport(results)
      return {
        schemaVersion: '1.0',
        thresholds: input.options.thresholds,
        files,
        testFiles,
      }
    })

  const checkpoint: MutationReportingService['checkpoint'] = (results) =>
    Effect.gen(function*() {
      if (!input.options.incremental) {
        return
      }
      const report = yield* slimIncrementalReport(results)
      yield* writeAtomic(input.options.incrementalFile, JSON.stringify(report))
    })

  return {
    reportCheckFailure,
    reportMutantRunResult,
    reportAll,
    checkpoint,
  }
}
