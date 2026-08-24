import path from 'node:path'

import {
  type Mutant,
  type MutantRunPlan,
  type MutantTestPlan,
  PlanKind,
  type StrykerOptions,
} from '@systemfsoftware/stryker-js-plugin-api/core'
import { type Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import * as Effect from 'effect/Effect'
import type * as FileSystem from 'effect/FileSystem'
import type * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Predicate from 'effect/Predicate'

import { isWarningEnabled } from '../config/is-warning-enabled.js'
import { optionsPath } from '../config/options-path.js'
import { readOriginal } from '../project/project-file.js'
import type { Project } from '../project/project.js'

import type { StrictReporter } from '../reporting/strict-reporter.js'
import { incrementalDiff, toRelativeNormalizedFileName } from './incremental-differ.js'
import { decidePlanForMutant } from './mutant-test-planner.kernel.js'
import { type TestCoverage } from './test-coverage.js'
function split<T>(
  values: Iterable<T>,
  predicate: (value: T, index: number) => boolean,
): [T[], T[]] {
  const left: T[] = []
  const right: T[] = []
  let index = 0
  for (const value of values) {
    if (predicate(value, index++)) {
      left.push(value)
    } else {
      right.push(value)
    }
  }
  return [left, right]
}

export interface MakePlanInput {
  readonly mutants: readonly Mutant[]
  readonly testCoverage: TestCoverage
  readonly reporter: StrictReporter
  readonly project: Project
  readonly sandboxFileFor: (fileName: string) => string
  readonly timeOverheadMS: number
  readonly options: StrykerOptions
  readonly logger: Logger
  readonly basePath: string
}

export const makePlan = (
  input: MakePlanInput,
): Effect.Effect<readonly MutantTestPlan[], PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.flatMap(incrementalDiffStep(input), ({ mutants: mutantsDiff, testCoverage }) => {
    const timeSpentAllTests = [...testCoverage.testsById.values()].reduce(
      (acc, t) => acc + t.timeSpentMs,
      0,
    )
    const globalTestFilter = input.project.testFiles.length > 0
      ? input.project.testFiles.map((file) => input.sandboxFileFor(file))
      : undefined
    const mutantPlans = mutantsDiff.map((mutant) =>
      planMutant(
        mutant,
        testCoverage,
        input.options,
        input.timeOverheadMS,
        timeSpentAllTests,
        globalTestFilter,
        input.sandboxFileFor,
      )
    )
    return Effect.flatMap(
      input.reporter.onMutationTestingPlanReady({ mutantPlans }).pipe(Effect.ignore),
      () => {
        warnAboutSlow(mutantPlans, input.options, input.logger)
        return Effect.succeed(mutantPlans)
      },
    )
  })
const planMutant = (
  mutant: Mutant,
  testCoverage: TestCoverage,
  options: StrykerOptions,
  timeOverheadMS: number,
  timeSpentAllTests: number,
  globalTestFilter: string[] | undefined,
  sandboxFileFor: (fileName: string) => string,
): MutantTestPlan => {
  const base = decidePlanForMutant(mutant, testCoverage, options, timeOverheadMS, timeSpentAllTests, globalTestFilter)
  if (base.plan === PlanKind.Run) {
    return {
      ...base,
      runOptions: {
        ...base.runOptions,
        sandboxFileName: sandboxFileFor(mutant.fileName),
      },
    }
  }
  return base
}

const warnAboutSlow = (
  mutantPlans: readonly MutantTestPlan[],
  options: StrykerOptions,
  logger: Logger,
): void => {
  if (!options.ignoreStatic && isWarningEnabled('slow', options.warnings)) {
    const ABSOLUTE_CUT_OFF_PERUNAGE = 0.4
    const RELATIVE_CUT_OFF_FACTOR = 2
    const zeroIfNaN = (n: number): number => (isNaN(n) ? 0 : n)
    const isRunPlan = (p: MutantTestPlan): p is MutantRunPlan => p.plan === PlanKind.Run
    const totalNetTime = (runPlans: readonly MutantRunPlan[]): number =>
      runPlans.reduce((acc, cur) => acc + cur.netTime, 0)
    const runPlans = mutantPlans.filter(isRunPlan)
    const [staticRunPlans, runTimeRunPlans] = split(runPlans, ({ mutant }) => Boolean(mutant.static))
    const estimatedTimeForStaticMutants = totalNetTime(staticRunPlans)
    const estimatedTimeForRunTimeMutants = totalNetTime(runTimeRunPlans)
    const estimatedTotalTime = estimatedTimeForRunTimeMutants + estimatedTimeForStaticMutants
    const avgTimeForAStaticMutant = zeroIfNaN(estimatedTimeForStaticMutants / staticRunPlans.length)
    const avgTimeForARunTimeMutant = zeroIfNaN(estimatedTimeForRunTimeMutants / runTimeRunPlans.length)
    const relativeTimeForStaticMutants = estimatedTimeForStaticMutants / estimatedTotalTime
    const absoluteCondition = relativeTimeForStaticMutants >= ABSOLUTE_CUT_OFF_PERUNAGE
    const relativeCondition = avgTimeForAStaticMutant >= RELATIVE_CUT_OFF_FACTOR * avgTimeForARunTimeMutant
    if (relativeCondition && absoluteCondition) {
      const percentage = (perunage: number): number => Math.round(perunage * 100)
      logger.warn(
        `Detected ${staticRunPlans.length} static mutants (${
          percentage(staticRunPlans.length / runPlans.length)
        }% of total) that are estimated to take ${
          percentage(relativeTimeForStaticMutants)
        }% of the time running the tests!\n  You might want to enable "ignoreStatic" to ignore these static mutants for your next run. \n  For more information about static mutants visit: https://stryker-mutator.io/docs/mutation-testing-elements/static-mutants\n  (disable "${
          optionsPath('warnings', 'slow')
        }" to ignore this warning)`,
      )
    }
  }
}

const incrementalDiffStep = (
  input: MakePlanInput,
): Effect.Effect<
  { readonly mutants: readonly Mutant[]; readonly testCoverage: TestCoverage },
  PlatformError,
  FileSystem.FileSystem | Path.Path
> => {
  const { incrementalReport } = input.project
  if (!incrementalReport) {
    return Effect.succeed({ mutants: input.mutants, testCoverage: input.testCoverage })
  }
  return Effect.flatMap(
    readAllOriginalFiles(input.project, input.basePath, [
      input.mutants,
      input.testCoverage.testsById.values(),
      Object.keys(incrementalReport.files),
      Object.keys(incrementalReport.testFiles ?? {}),
    ]),
    (currentFiles) => {
      const result = incrementalDiff({
        logger: input.logger,
        options: input.options,
        fileDescriptions: input.project.fileDescriptions,
        currentMutants: input.mutants,
        testCoverage: input.testCoverage,
        incrementalReport,
        currentRelativeFiles: currentFiles,
        basePath: input.basePath,
      })
      return Effect.succeed({ mutants: result.mutants, testCoverage: result.testCoverage })
    },
  )
}

const readAllOriginalFiles = (
  project: Project,
  basePath: string,
  thingsWithFileNamesOrFileNames: readonly (Iterable<string | { fileName?: string }>)[],
): Effect.Effect<ReadonlyMap<string, string>, PlatformError, FileSystem.FileSystem> => {
  const uniqueFileNames = [
    ...new Set(
      thingsWithFileNamesOrFileNames
        .flatMap((container) => [...container].map((thing) => (typeof thing === 'string' ? thing : thing.fileName)))
        .filter(Predicate.isNotNullish)
        .map((fileName) => path.resolve(fileName)),
    ),
  ]
  const projectFiles = project.files
  return Effect.forEach(uniqueFileNames, (fileName) =>
    Effect.gen(function*() {
      const file = projectFiles.get(fileName)
      if (!file) {
        return undefined
      }
      const originalContent: string | undefined = yield* readOriginal(file).pipe(
        Effect.orElseSucceed(() => undefined),
      )
      if (originalContent === undefined) {
        return undefined
      }
      return [toRelativeNormalizedFileName(basePath, fileName), originalContent] as const
    })).pipe(Effect.map((entries) => new Map(entries.filter(Predicate.isNotNullish))))
}

export const isEarlyResult = (mutantPlan: MutantTestPlan): boolean => mutantPlan.plan === PlanKind.EarlyResult

export const isRunPlan = (mutantPlan: MutantTestPlan): boolean => mutantPlan.plan === PlanKind.Run
