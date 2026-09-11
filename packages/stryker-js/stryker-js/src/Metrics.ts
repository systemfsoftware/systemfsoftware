import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'

import type { Metrics, MetricsResult } from './Metrics.schema.js'

export { MetricsResultSchema, MetricsSchema } from './Metrics.schema.js'
export type { Metrics, MetricsResult } from './Metrics.schema.js'
import type { FileResult, MutantResult } from './Report.schema.js'

const countStatus = (mutants: readonly MutantResult[], status: MutantResult['status']): number =>
  mutants.filter((mutant) => mutant.status === status).length

const percentage = (numerator: number, denominator: number): number => (numerator / denominator) * 100

/** A percentage whose denominator is zero is not 0%; `emptyDenominator` says what it is instead. */
const percentOr = (emptyDenominator: number, numerator: number, denominator: number): number =>
  Match.value(denominator).pipe(
    Match.when(0, () => emptyDenominator),
    Match.orElse(() => percentage(numerator, denominator)),
  )

const coveredFraction = (totalDetected: number, totalCovered: number, totalValid: number): number =>
  Match.value(totalValid).pipe(
    Match.when(0, () => Number.NaN),
    Match.orElse(() => percentOr(0, totalDetected, totalCovered)),
  )

export const countMutants = (mutants: readonly MutantResult[]): Metrics => {
  const pending = countStatus(mutants, 'Pending')
  const killed = countStatus(mutants, 'Killed')
  const timeout = countStatus(mutants, 'Timeout')
  const survived = countStatus(mutants, 'Survived')
  const noCoverage = countStatus(mutants, 'NoCoverage')
  const runtimeErrors = countStatus(mutants, 'RuntimeError')
  const compileErrors = countStatus(mutants, 'CompileError')
  const ignored = countStatus(mutants, 'Ignored')
  const totalDetected = timeout + killed
  const totalUndetected = survived + noCoverage
  const totalCovered = totalDetected + survived
  const totalValid = totalUndetected + totalDetected
  const totalInvalid = runtimeErrors + compileErrors
  return {
    pending,
    killed,
    timeout,
    survived,
    noCoverage,
    runtimeErrors,
    compileErrors,
    ignored,
    totalDetected,
    totalUndetected,
    totalCovered,
    totalValid,
    totalInvalid,
    totalMutants: totalValid + totalInvalid + ignored + pending,
    mutationScore: percentOr(Number.NaN, totalDetected, totalValid),
    mutationScoreBasedOnCoveredCode: coveredFraction(totalDetected, totalCovered, totalValid),
  }
}

const segmentOf = (fileName: string): string => {
  const separator = fileName.indexOf('/')
  if (separator === -1) {
    return fileName
  }
  return fileName.slice(0, separator)
}

const groupBySegment = (
  files: Readonly<Record<string, FileResult>>,
): Readonly<Record<string, Readonly<Record<string, FileResult>>>> =>
  Object.entries(files).reduce<Record<string, Record<string, FileResult>>>((groups, [fileName, file]) => {
    const segment = segmentOf(fileName)
    const group = groups[segment] ?? {}
    group[fileName] = file
    groups[segment] = group
    return groups
  }, {})

const metricsOf = (files: Readonly<Record<string, FileResult>>): Metrics =>
  countMutants(Object.values(files).flatMap((file) => file.mutants))

const fileResultOf = (fileName: string, file: FileResult): MetricsResult => ({
  name: fileName,
  metrics: countMutants(file.mutants),
  childResults: [],
})

const nestedGroupResult = (segment: string, entries: readonly (readonly [string, FileResult])[]): MetricsResult => {
  const nested = Object.fromEntries(entries.map(([fileName, file]) => [fileName.slice(segment.length + 1), file]))
  return { name: segment, metrics: metricsOf(nested), childResults: childResultsOf(nested) }
}

const soleSegmentFileResult = (
  segment: string,
  entries: readonly (readonly [string, FileResult])[],
): Option.Option<MetricsResult> =>
  Option.flatMap(
    Arr.head(entries),
    ([fileName, file]) =>
      Match.value(fileName === segment && entries.length === 1).pipe(
        Match.when(true, () => Option.some(fileResultOf(fileName, file))),
        Match.orElse(() => Option.none<MetricsResult>()),
      ),
  )

const childResultOf = (segment: string, entries: readonly (readonly [string, FileResult])[]): MetricsResult =>
  Option.getOrElse(soleSegmentFileResult(segment, entries), () => nestedGroupResult(segment, entries))

const childResultsOf = (files: Readonly<Record<string, FileResult>>): readonly MetricsResult[] =>
  Object.entries(groupBySegment(files))
    .map(([segment, grouped]): MetricsResult => childResultOf(segment, Object.entries(grouped)))
    .sort((left, right) => left.name.localeCompare(right.name))

export const calculateMetrics = (files: Readonly<Record<string, FileResult>>): MetricsResult => ({
  name: 'All files',
  metrics: metricsOf(files),
  childResults: childResultsOf(files),
})
