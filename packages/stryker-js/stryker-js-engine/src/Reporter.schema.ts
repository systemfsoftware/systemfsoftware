import { Wire } from '@systemfsoftware/effect-cell-types'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'
import * as S from 'effect/Schema'
import type { MutationTestMetricsResult } from 'mutation-testing-metrics'
import type * as report from 'mutation-testing-report-schema/api'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Array.isArray(value) === false

// What renderClearText walks: report.files[fileName].mutants[] (extractReportMutants,
// collectMutants). Source and per-mutant details stay unchecked; the gate is the shape
// the traversal touches, so anything without a files record of mutant arrays is refused.
const isFileResultLike = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false
  }
  return Array.isArray(value['mutants']) && value['mutants'].every(isRecord)
}

const isMutationTestResult = (value: unknown): value is report.MutationTestResult => {
  if (!isRecord(value)) {
    return false
  }
  const files: unknown = value['files']
  if (!isRecord(files)) {
    return false
  }
  return Object.values(files).every(isFileResultLike)
}
const MutationTestResultSchema = Wire.mint(S.Unknown.pipe(S.refine(isMutationTestResult)))
// What the clear-text score table walks: metrics.systemUnderTestMetrics with its numeric
// metrics (mutationScore, counts), name for the file column, and childResults recursed
// by drawTableBody. testMetrics rides along unchecked: nothing on this path reads it.
const isMetricsLike = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false
  }
  const metrics: unknown = value['metrics']
  if (!isRecord(metrics)) {
    return false
  }
  const numericFields: readonly unknown[] = [
    metrics['mutationScore'],
    metrics['mutationScoreBasedOnCoveredCode'],
    metrics['killed'],
    metrics['timeout'],
    metrics['survived'],
    metrics['noCoverage'],
    metrics['runtimeErrors'],
    metrics['compileErrors'],
    metrics['totalMutants'],
  ]
  return numericFields.every((field) => typeof field === 'number')
}

const isMetricsResultLike = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false
  }
  if (typeof value['name'] !== 'string') {
    return false
  }
  if (!Array.isArray(value['childResults'])) {
    return false
  }
  if (!isMetricsLike(value)) {
    return false
  }
  return value['childResults'].every(isMetricsResultLike)
}

const isMutationTestMetricsResult = (value: unknown): value is MutationTestMetricsResult => {
  if (!isRecord(value)) {
    return false
  }
  return isMetricsResultLike(value['systemUnderTestMetrics'])
}
const MutationTestMetricsResultSchema = Wire.mint(S.Unknown.pipe(S.refine(isMutationTestMetricsResult)))
export class ClearTextReportCommand extends S.TaggedClass<ClearTextReportCommand>()('ClearTextReportCommand', {
  report: MutationTestResultSchema,
  metrics: MutationTestMetricsResultSchema,
  options: StrykerOptionsSchema,
}) {}

export class ClearTextDocument extends S.TaggedClass<ClearTextDocument>()('ClearTextDocument', {
  stdout: S.Array(S.String),
  debug: S.Array(S.String),
}) {}

export class JsonReportCommand extends S.TaggedClass<JsonReportCommand>()('JsonReportCommand', {
  report: MutationTestResultSchema,
}) {}

export class JsonDocument extends S.TaggedClass<JsonDocument>()('JsonDocument', {
  json: S.String,
}) {}
