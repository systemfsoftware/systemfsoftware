import { Wire } from '@systemfsoftware/effect-cell-types'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'
import * as S from 'effect/Schema'
import type { MutationTestMetricsResult } from 'mutation-testing-metrics'
import type * as report from 'mutation-testing-report-schema/api'

const isMutationTestResult = (_value: unknown): _value is report.MutationTestResult => true
const MutationTestResultSchema = Wire.mint(S.Unknown.pipe(S.refine(isMutationTestResult)))
const isMutationTestMetricsResult = (_value: unknown): _value is MutationTestMetricsResult => true
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

export class ClearTextReportError extends S.TaggedError<ClearTextReportError>()('ClearTextReportError', {
  message: S.String,
}) {}

export class JsonReportCommand extends S.TaggedClass<JsonReportCommand>()('JsonReportCommand', {
  report: MutationTestResultSchema,
}) {}

export class JsonDocument extends S.TaggedClass<JsonDocument>()('JsonDocument', {
  json: S.String,
}) {}

export class JsonReportError extends S.TaggedError<JsonReportError>()('JsonReportError', {
  message: S.String,
}) {}
