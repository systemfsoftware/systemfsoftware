import type { Metrics, MetricsResult } from './Metrics.schema.js'

export { MetricsResultSchema, MetricsSchema } from './Metrics.schema.js'
export type { Metrics, MetricsResult } from './Metrics.schema.js'
import type { FileResult, MutantResult } from './Report.schema.js'

const countStatus = (mutants: readonly MutantResult[], status: MutantResult['status']): number =>
  mutants.filter((mutant) => mutant.status === status).length

const fraction = (numerator: number, denominator: number): number => {
  if (denominator === 0) {
    return Number.NaN
  }
  return (numerator / denominator) * 100
}

const coveredFraction = (totalDetected: number, totalCovered: number, totalValid: number): number => {
  if (totalValid === 0) {
    return Number.NaN
  }
  if (totalCovered === 0) {
    return 0
  }
  return (totalDetected / totalCovered) * 100
}

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
    mutationScore: fraction(totalDetected, totalValid),
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
): Readonly<Record<string, Readonly<Record<string, FileResult>>>> => {
  const groups: Record<string, Record<string, FileResult>> = {}
  for (const [fileName, file] of Object.entries(files)) {
    const segment = segmentOf(fileName)
    const nested = groups[segment] ?? {}
    nested[fileName] = file
    groups[segment] = nested
  }
  return groups
}

const metricsOf = (files: Readonly<Record<string, FileResult>>): Metrics =>
  countMutants(Object.values(files).flatMap((file) => file.mutants))

const childResultsOf = (files: Readonly<Record<string, FileResult>>): readonly MetricsResult[] => {
  const groups = groupBySegment(files)
  return Object.entries(groups)
    .map(([segment, grouped]) => {
      const entries = Object.entries(grouped)
      let only: readonly [string, FileResult] | undefined
      if (entries.length === 1) {
        only = entries[0]
      }
      if (only !== undefined && only[0] === segment) {
        const [fileName, file] = only
        const fileResult: MetricsResult = { name: fileName, metrics: countMutants(file.mutants), childResults: [] }
        return fileResult
      }
      const nested = Object.fromEntries(entries.map(([fileName, file]) => [fileName.slice(segment.length + 1), file]))
      const directory: MetricsResult = {
        name: segment,
        metrics: metricsOf(nested),
        childResults: childResultsOf(nested),
      }
      return directory
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}

export const calculateMetrics = (files: Readonly<Record<string, FileResult>>): MetricsResult => ({
  name: 'All files',
  metrics: metricsOf(files),
  childResults: childResultsOf(files),
})
