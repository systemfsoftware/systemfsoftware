import { Schema } from 'effect'

export class ApiReportMismatchError extends Schema.TaggedError<ApiReportMismatchError>()(
  'ApiReportMismatchError',
  {
    reportFilePath: Schema.String,
    diff: Schema.String,
  },
) {}

export class ApiReportMissingError extends Schema.TaggedError<ApiReportMissingError>()(
  'ApiReportMissingError',
  {
    reportFilePath: Schema.String,
  },
) {}
