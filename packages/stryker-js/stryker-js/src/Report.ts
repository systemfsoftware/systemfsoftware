export {
  FileResultSchema,
  MetricsResultSchema,
  MetricsSchema,
  MutantResultSchema,
  MutationTestResultSchema,
} from './Report.schema.js'

export type {
  BrandingInformation,
  Dependencies,
  FileResult,
  FileResultDictionary,
  FrameworkInformation,
  Metrics,
  MetricsResult,
  MutantResult,
  MutationTestResult,
  OpenEndLocation,
  TestDefinition,
  TestFile,
  TestFileDefinitionDictionary,
  Thresholds,
} from './Report.schema.js'

import type { MutantStatus } from './Mutant.schema.js'
import type { FileResult, Metrics, MetricsResult, MutantResult } from './Report.schema.js'

type FileEntry = readonly [string, FileResult]

const countStatus = (mutants: readonly MutantResult[], status: MutantStatus): number =>
  mutants.filter((mutant) => mutant.status === status).length

const percentage = (numerator: number, denominator: number): number => (numerator / denominator) * 100

const percentOr = (emptyDenominator: number, numerator: number, denominator: number): number => {
  if (denominator === 0) return emptyDenominator
  return percentage(numerator, denominator)
}

const coveredFraction = (totalDetected: number, totalCovered: number, totalValid: number): number => {
  if (totalValid === 0) return Number.NaN
  return percentOr(0, totalDetected, totalCovered)
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
    mutationScore: percentOr(Number.NaN, totalDetected, totalValid),
    mutationScoreBasedOnCoveredCode: coveredFraction(totalDetected, totalCovered, totalValid),
  }
}

const segmentOf = (fileName: string): string => {
  const separator = fileName.indexOf('/')
  if (separator === -1) return fileName
  return fileName.slice(0, separator)
}

const groupBySegment = (
  files: Readonly<Record<string, FileResult>>,
): Readonly<Record<string, Readonly<Record<string, FileResult>>>> =>
  Object.entries(files).reduce<Record<string, Record<string, FileResult>>>((groups, [fileName, file]) => {
    const segment = segmentOf(fileName)
    const group = groups[segment] ?? {}
    groups[segment] = { ...group, [fileName]: file }
    return groups
  }, {})

const metricsOf = (files: Readonly<Record<string, FileResult>>): Metrics =>
  countMutants(Object.values(files).flatMap((file) => file.mutants))

const fileResultOf = (fileName: string, file: FileResult): MetricsResult => ({
  name: fileName,
  metrics: countMutants(file.mutants),
  childResults: [],
})

const nestedGroupResult = (segment: string, entries: readonly FileEntry[]): MetricsResult => {
  const nested = Object.fromEntries(entries.map(([fileName, file]) => [fileName.slice(segment.length + 1), file]))
  return { name: segment, metrics: metricsOf(nested), childResults: childResultsOf(nested) }
}

const isSoleEntry = (entries: readonly FileEntry[]): entries is readonly [FileEntry] => entries.length === 1

const namedFileResult = (segment: string, entry: FileEntry): MetricsResult | null => {
  if (entry[0] === segment) return fileResultOf(entry[0], entry[1])
  return null
}

const soleSegmentFileResult = (segment: string, entries: readonly FileEntry[]): MetricsResult | null => {
  if (!isSoleEntry(entries)) return null
  return namedFileResult(segment, entries[0])
}

const childResultOf = (segment: string, entries: readonly FileEntry[]): MetricsResult => {
  const sole = soleSegmentFileResult(segment, entries)
  if (sole === null) return nestedGroupResult(segment, entries)
  return sole
}

const childResultsOf = (files: Readonly<Record<string, FileResult>>): readonly MetricsResult[] =>
  Object.entries(groupBySegment(files))
    .map(([segment, grouped]): MetricsResult => childResultOf(segment, Object.entries(grouped)))
    .sort((left, right) => left.name.localeCompare(right.name))

export const calculateMetrics = (files: Readonly<Record<string, FileResult>>): MetricsResult => ({
  name: 'All files',
  metrics: metricsOf(files),
  childResults: childResultsOf(files),
})
