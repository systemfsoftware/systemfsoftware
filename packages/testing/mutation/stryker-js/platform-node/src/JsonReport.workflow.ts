import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import type * as schema from 'mutation-testing-report-schema/api'
const isMutationTestResult = (_value: unknown): _value is schema.MutationTestResult => true
const MutationTestResultSchema = S.declare(isMutationTestResult)

export class JsonReportCommand extends S.TaggedClass<JsonReportCommand>()('JsonReportCommand', {
  report: MutationTestResultSchema,
}) {}

export class JsonDocument extends S.TaggedClass<JsonDocument>()('JsonDocument', {
  json: S.String,
}) {}

export class JsonReportError extends S.TaggedError<JsonReportError>()('JsonReportError', {
  message: S.String,
}) {}

export function buildJsonReport(report: schema.MutationTestResult): string {
  return JSON.stringify(report, null, 0)
}

export const makeJsonDocument = Workflow.make(
  JsonReportCommand,
  (command: JsonReportCommand): Result.Result<JsonDocument, JsonReportError> => {
    const json = buildJsonReport(command.report)
    return Result.succeed(JsonDocument.make({ json }))
  },
)
