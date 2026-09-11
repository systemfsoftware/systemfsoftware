import { MetricsResultSchema } from '@systemfsoftware/stryker-js/Metrics'
import { MutationTestResultSchema } from '@systemfsoftware/stryker-js/Report'
import * as S from 'effect/Schema'
export class ClearTextReportCommand extends S.TaggedClass<ClearTextReportCommand>()('ClearTextReportCommand', {
  report: MutationTestResultSchema,
  metrics: MetricsResultSchema,
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
