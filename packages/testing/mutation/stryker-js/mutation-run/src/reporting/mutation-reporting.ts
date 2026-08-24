import { type CheckResult, type PassedCheckResult } from '@systemfsoftware/stryker-js-plugin-api/check'
import {
  type MutantResult,
  type MutantTestCoverage,
  schema,
  type StrykerOptions,
} from '@systemfsoftware/stryker-js-plugin-api/core'
import { Evaluator } from '@systemfsoftware/stryker-js-plugin-api/evaluate'
import { type Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { PluginKind, RunConfiguration, SandboxDirectory } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import type { AnyPluginContribution } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { type ReporterService } from '@systemfsoftware/stryker-js-plugin-api/report'
import { type MutantRunResult, type TestResult } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { Context, Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as HashMap from 'effect/HashMap'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import type * as Scope from 'effect/Scope'
import { calculateMutationTestMetrics, type MutationTestMetricsResult } from 'mutation-testing-metrics'

import { ExitClass, highestExitClass, verdictExitClass } from '../exit-classification.js'
import { type TestCoverage } from '../mutants/index.js'
import type { ResolvedMode } from '../output-mode.js'
import { createAll } from '../plugins/plugin-creator.js'
import type { Project } from '../project/index.js'
import { readOriginal } from '../project/project-file.js'
import type { RunEventSink } from '../run-event.js'
import type { RunOutcome } from '../run-stages/stage-results.js'
import { strykerVersion } from '../stryker-package.js'
import { buildVerdictEnvelope, type VerdictEvaluatorVerdict } from '../verdict-envelope.js'
import { toSchemaLocation, toSchemaPosition } from './report-location.js'
import {
  checkStatusToMutantStatus,
  determineLanguage,
  mapRunResult,
  normalizeReportFileName,
} from './report-mapping.js'

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
  ) => Effect.Effect<MutantResult, unknown>
  readonly reportMutantRunResult: (
    mutant: MutantTestCoverage,
    result: MutantRunResult,
  ) => Effect.Effect<MutantResult, unknown>
  readonly reportAll: (
    results: readonly MutantResult[],
  ) => Effect.Effect<RunOutcome, unknown, FileSystem.FileSystem | Path.Path | Scope.Scope>
}

export class MutationReporting extends Context.Service<MutationReporting, MutationReportingService>()(
  'MutationReporting',
) {}

export interface MakeMutationReportingInput {
  readonly reporter: ReporterService
  readonly options: StrykerOptions
  readonly project: Project
  readonly log: Logger
  readonly testCoverage: TestCoverage
  readonly requireFromCwd: (id: string, from?: string) => unknown
  readonly runEventSink: RunEventSink
  readonly runId: string
  readonly resolvedMode: ResolvedMode
  readonly pluginsByKind: HashMap.HashMap<PluginKind, readonly AnyPluginContribution[]>
  readonly sandboxDirectory: string
  readonly basePath: string
}

export const makeMutationReportingService = (input: MakeMutationReportingInput): MutationReportingService => {
  const reportOne = (result: MutantResult): Effect.Effect<MutantResult, unknown> =>
    input.reporter.onMutantTested(result).pipe(Effect.as(result))

  const reportMutantStatus = (
    mutant: MutantTestCoverage,
    status: MutantResult['status'],
  ): Effect.Effect<MutantResult, unknown> => {
    const location = toSchemaLocation(mutant.location)
    return reportOne({
      ...mutant,
      status,
      location,
    })
  }

  const reportCheckFailure: MutationReportingService['reportCheckFailure'] = (mutant, result) =>
    reportMutantStatus(mutant, checkStatusToMutantStatus(result.status))

  const reportMutantRunResult: MutationReportingService['reportMutantRunResult'] = (mutant, result) => {
    const mapped = mapRunResult(mutant, result)
    return reportOne(mapped)
  }

  const toTestDefinition = (test: TestResult, remapTestId: (id: string) => string): schema.TestDefinition => ({
    id: remapTestId(test.id),
    name: test.name,
    ...(test.startPosition === undefined ? {} : { location: { start: toSchemaPosition(test.startPosition) } }),
  })

  const toMutantResult = (
    mutantResult: MutantResult,
    remapTestIds: (ids: string[] | undefined) => string[] | undefined,
  ): schema.MutantResult => {
    const { fileName, location, killedBy, coveredBy, ...apiMutant } = mutantResult
    const remappedKilledBy = remapTestIds(killedBy)
    const remappedCoveredBy = remapTestIds(coveredBy)
    return {
      ...apiMutant,
      ...(remappedKilledBy === undefined ? {} : { killedBy: remappedKilledBy }),
      ...(remappedCoveredBy === undefined ? {} : { coveredBy: remappedCoveredBy }),
      location,
    }
  }

  const toFileResult = (fileName: string): Effect.Effect<schema.FileResult, unknown, FileSystem.FileSystem> =>
    Effect.gen(function*() {
      const fileResult: schema.FileResult = {
        language: determineLanguage(fileName),
        mutants: [],
        source: '',
      }
      const sourceFile = input.project.files.get(fileName)
      if (sourceFile) {
        fileResult.source = yield* readOriginal(sourceFile)
      } else {
        input.log.warn(
          `File "${fileName}" not found
    in input files, but did receive mutant result for it. This shouldn't happen`.replace(/\s+/g, ' ').trim(),
        )
      }
      return fileResult
    })

  const toTestFile = (
    fileName: string | undefined,
  ): Effect.Effect<schema.TestFile, unknown, FileSystem.FileSystem> =>
    Effect.gen(function*() {
      const testFile: schema.TestFile = { tests: [] }
      if (fileName) {
        const file = input.project.files.get(fileName)
        if (file) {
          testFile.source = yield* readOriginal(file)
        } else {
          input.log.warn(
            `Test file "${fileName}" not found
        in input files, but did receive test result for it. This shouldn't happen.`.replace(/\s+/g, ' ').trim(),
          )
        }
      }
      return testFile
    })

  const toFileResults = (
    results: readonly MutantResult[],
    remapTestIds: (ids: string[] | undefined) => string[] | undefined,
  ): Effect.Effect<schema.FileResultDictionary, unknown, FileSystem.FileSystem> =>
    Effect.gen(function*() {
      const uniqueFileNames = results
        .map(({ fileName }) => fileName)
        .filter((value, index, array) => array.indexOf(value) === index)
      // Distinct files, joined by name afterwards, so order does not matter and
      // `Effect.forEach`'s sequential default only serialised the reads.
      const entries = yield* Effect.forEach(
        uniqueFileNames,
        (fileName) => toFileResult(fileName).pipe(Effect.map((result) => [fileName, result] as const)),
        { concurrency: 'unbounded' },
      )
      const fileResultsByName: Record<string, schema.FileResult> = Object.fromEntries(entries)

      return results.reduce<schema.FileResultDictionary>((acc, mutantResult) => {
        const reportFileName = normalizeReportFileName(input.basePath, mutantResult.fileName)
        let fileResult = acc[reportFileName]
        if (fileResult === undefined) {
          const prepared = fileResultsByName[mutantResult.fileName]
          if (prepared === undefined) {
            return acc
          }
          acc[reportFileName] = prepared
          fileResult = prepared
        }
        fileResult.mutants.push(toMutantResult(mutantResult, remapTestIds))
        return acc
      }, {})
    })

  const toTestFiles = (
    remapTestId: (id: string) => string,
  ): Effect.Effect<schema.TestFileDefinitionDictionary, unknown, FileSystem.FileSystem> =>
    Effect.gen(function*() {
      const uniqueTestFileNames = [...input.testCoverage.testsById.values()]
        .map(({ fileName }) => fileName)
        .filter((value, index, array) => array.indexOf(value) === index)
        .filter((value): value is string => value !== undefined)
      const mapped = uniqueTestFileNames.map((fileName) => normalizeReportFileName(input.basePath, fileName))
      const entries = yield* Effect.forEach(
        uniqueTestFileNames,
        (fileName, index) => toTestFile(fileName).pipe(Effect.map((file) => [mapped[index] ?? '', file] as const)),
        { concurrency: 'unbounded' },
      )
      const testFilesByName: Record<string, schema.TestFile> = Object.fromEntries(entries)

      return [...input.testCoverage.testsById.values()].reduce<schema.TestFileDefinitionDictionary>(
        (acc, testResult) => {
          const test = toTestDefinition(testResult, remapTestId)
          const reportFileName = normalizeReportFileName(input.basePath, testResult.fileName)
          let testFile = acc[reportFileName]
          if (testFile === undefined) {
            const prepared = testFilesByName[reportFileName]
            if (prepared === undefined) {
              return acc
            }
            acc[reportFileName] = prepared
            testFile = prepared
          }
          testFile.tests.push(test)
          return acc
        },
        {},
      )
    })

  const mutationTestReport = (
    results: readonly MutantResult[],
  ): Effect.Effect<schema.MutationTestResult, unknown, FileSystem.FileSystem> =>
    Effect.gen(function*() {
      const testIdMap: Record<string, string> = Object.fromEntries(
        [...input.testCoverage.testsById.values()].map((test, index) => [test.id, index.toString()] as const),
      )
      const remapTestId = (id: string): string => testIdMap[id] ?? id
      const remapTestIds = (ids: string[] | undefined): string[] | undefined => ids?.map(remapTestId)

      const files = yield* toFileResults(results, remapTestIds)
      const testFiles = yield* toTestFiles(remapTestId)

      return {
        files,
        schemaVersion: '1.0',
        thresholds: input.options.thresholds,
        testFiles,
        projectRoot: input.basePath,
        config: input.options,
        framework: {
          ...STRYKER_FRAMEWORK,
          dependencies: discoverDependencies(),
        },
      }
    })

  const discoverDependencies = (): schema.Dependencies => {
    const discover = (specifier: string): readonly [string, string] | undefined => {
      try {
        const raw = input.requireFromCwd(`${specifier}/package.json`)
        const decoded = Result.getOrThrow(S.decodeUnknownResult(S.Record(S.String, S.Unknown))(raw))
        const version = decoded['version']
        const versionText = typeof version === 'string' ? version : JSON.stringify(version) ?? ''
        return [specifier, versionText]
      } catch {
        return undefined
      }
    }
    const dependencies = [
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
    ]
    return dependencies
      .map(discover)
      .reduce<schema.Dependencies>((acc, dependency) => {
        if (dependency) {
          acc[dependency[0]] = dependency[1]
        }
        return acc
      }, {})
  }

  const determineExitCode = (metrics: MutationTestMetricsResult): ExitClass | null => {
    const { mutationScore } = metrics.systemUnderTestMetrics.metrics
    const breaking = input.options.thresholds.break
    const formattedScore = mutationScore.toFixed(2)

    if (typeof breaking !== 'number') {
      input.log.debug(
        "No breaking threshold configured. Won't fail the build no matter how low your mutation score is. Set `thresholds.break` to change this behavior.",
      )
      return null
    }

    const verdict = verdictExitClass(mutationScore, breaking)
    if (verdict === null) {
      input.log.info(
        `Final mutation score of ${formattedScore} is greater than or equal to break threshold ${String(breaking)}`,
      )
      return null
    }

    input.log.error(
      `Final mutation score ${formattedScore} under breaking threshold ${
        String(breaking)
      }, setting exit code to 1 (failure).`,
    )
    input.log.info('(improve mutation score or set `thresholds.break = null` to prevent this error in the future)')
    return verdict
  }

  const emitVerdict = (
    report: schema.MutationTestResult,
    evaluatorVerdicts: readonly VerdictEvaluatorVerdict[],
  ): void => {
    input.runEventSink({
      kind: 'verdict',
      ...buildVerdictEnvelope(
        report,
        input.resolvedMode.mode,
        input.resolvedMode.signal,
        input.runId,
        input.basePath,
        evaluatorVerdicts,
      ),
    })
  }

  const runEvaluators = (
    report: schema.MutationTestResult,
  ): Effect.Effect<readonly VerdictEvaluatorVerdict[], unknown, Scope.Scope> =>
    Effect.gen(function*() {
      const contributions = yield* createAll(input.pluginsByKind, PluginKind.Evaluator)
      return yield* Effect.forEach(contributions, (contribution) =>
        Effect.gen(function*() {
          const context = yield* Layer.build(contribution.layer)
          const verdict = yield* Context.get(context, Evaluator).evaluate(report)
          return { name: contribution.name, verdict } satisfies VerdictEvaluatorVerdict
        }))
    }).pipe(
      Effect.provideService(RunConfiguration, input.options),
      Effect.provideService(SandboxDirectory, input.sandboxDirectory),
    )
  const reportAll: MutationReportingService['reportAll'] = (results) =>
    Effect.gen(function*() {
      const report = yield* mutationTestReport(results)
      const metrics = calculateMutationTestMetrics(report)
      yield* input.reporter.onMutationTestReportReady(report, metrics)
      // The run's verdict is the most severe class anyone reported: the score
      // against its own breaking threshold, plus whatever each evaluator
      // plugin decided. One rule, one function — the process exit code is
      // derived from the same precedence at the CLI edge.
      const evaluatorVerdicts = yield* runEvaluators(report)
      const scoreVerdict = determineExitCode(metrics)
      const evaluatorClasses = evaluatorVerdicts
        .map((entry) => entry.verdict)
        .filter((value): value is ExitClass => value !== null)
      const verdict = highestExitClass(
        scoreVerdict === null ? evaluatorClasses : [scoreVerdict, ...evaluatorClasses],
      )
      emitVerdict(report, evaluatorVerdicts)
      if (input.options.incremental && verdict === null) {
        const fs = yield* FileSystem.FileSystem
        const pathService = yield* Path.Path
        const dir = pathService.dirname(input.options.incrementalFile)
        yield* fs.makeDirectory(dir, { recursive: true })
        yield* fs.writeFileString(input.options.incrementalFile, JSON.stringify(report, null, 2))
      }
      return { results, verdict } satisfies RunOutcome
    })

  return {
    reportCheckFailure,
    reportMutantRunResult,
    reportAll,
  }
}

export const makeMutationReportingLayer = (input: MakeMutationReportingInput): Layer.Layer<MutationReporting> =>
  Layer.succeed(MutationReporting, makeMutationReportingService(input))

export { normalizeReportFileName } from './report-mapping.js'
